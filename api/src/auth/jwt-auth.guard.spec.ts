import { generateKeyPairSync, KeyObject, sign } from "crypto";
import { createServer, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { mockDeep } from "jest-mock-extended";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { UsersService } from "src/users/users.service";
import { UserWithDetails } from "src/users/users.types";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtStrategy } from "./jwt.strategy";

// jose 6 is ESM-only, which Jest's CommonJS runtime can't load (Node can).
// jwks-rsa uses three of its helpers to read tokens and import keys; these
// stand-ins do the same with Node's crypto, and the rest of jwks-rsa runs as is.
jest.mock(require.resolve("jose", { paths: [require.resolve("jwks-rsa")] }), () => {
  const { createPublicKey } = jest.requireActual<typeof import("crypto")>("crypto");
  const segment = (token: string, index: number): Record<string, unknown> => {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid Compact JWS");
    return JSON.parse(Buffer.from(parts[index], "base64url").toString("utf8")) as Record<string, unknown>;
  };
  return {
    decodeJwt: (token: string) => segment(token, 1),
    decodeProtectedHeader: (token: string) => segment(token, 0),
    importJWK: (jwk: import("crypto").JsonWebKey) => Promise.resolve(createPublicKey({ key: jwk, format: "jwk" })),
  };
});

/**
 * Runs the real chain: passport, passport-jwt, jwks-rsa fetching our key set
 * from a local server, and jsonwebtoken, against tokens signed here.
 */
describe("JwtAuthGuard", () => {
  const ISSUER = "https://test.example.auth0.com/";
  const AUDIENCE = "https://api.test.example.com";
  const KEY_ID = "test-key";
  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";

  const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

  let keySetServer: Server;
  let jwksUri: string;
  let answerKeySetRequest: (res: ServerResponse) => void;
  let usersService: ReturnType<typeof mockDeep<UsersService>>;
  let guard: JwtAuthGuard;

  const nowInSeconds = () => Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

  const signToken = (
    claims: Record<string, unknown>,
    { kid = KEY_ID, privateKey = signingKey.privateKey }: { kid?: string; privateKey?: KeyObject } = {},
  ): string => {
    const unsigned = `${encode({ alg: "RS256", typ: "JWT", kid })}.${encode(claims)}`;
    return `${unsigned}.${sign("sha256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
  };

  const validClaims = (): Record<string, unknown> => ({
    sub: providerSub,
    iss: ISSUER,
    aud: AUDIENCE,
    iat: nowInSeconds() - 60,
    exp: nowInSeconds() + 3600,
  });

  /** The guard's verdict on a request with this Authorization header. */
  const verdictFor = async (authorization?: string): Promise<unknown> => {
    const request = { headers: authorization ? { authorization } : {} };
    try {
      return await guard.canActivate(new ExecutionContextHost([request, {}]));
    } catch (error) {
      return error;
    }
  };

  const rejection = (reason: string) => new UnauthorizedException(RESPONSE_TEMPLATES.TOKEN_REJECTED(reason));

  const serveKeySet = (res: ServerResponse) => {
    const publicJwk = signingKey.publicKey.export({ format: "jwk" });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [{ ...publicJwk, kid: KEY_ID, alg: "RS256", use: "sig" }] }));
  };

  /** Registers a strategy with passport as "jwt", with a fresh key cache and fetch limit. */
  const useStrategyFetchingFrom = (uri: string) => {
    const config: Record<string, string> = {
      "auth0.domain": "test.example.auth0.com",
      "auth0.audience": AUDIENCE,
      "auth0.jwksUri": uri,
    };
    new JwtStrategy({ getOrThrow: (key: string) => config[key] } as unknown as ConfigService, usersService);
  };

  beforeAll(async () => {
    keySetServer = createServer((_req, res) => answerKeySetRequest(res));
    await new Promise<void>((resolve) => keySetServer.listen(0, "127.0.0.1", resolve));
    jwksUri = `http://127.0.0.1:${(keySetServer.address() as AddressInfo).port}/.well-known/jwks.json`;
  });

  afterAll(async () => {
    await new Promise((resolve) => keySetServer.close(resolve));
  });

  beforeEach(() => {
    answerKeySetRequest = serveKeySet;
    usersService = mockDeep<UsersService>();
    usersService.resolveByProviderSub.mockResolvedValue({ id: userId, providerSub } as UserWithDetails);
    useStrategyFetchingFrom(jwksUri);
    guard = new JwtAuthGuard();
  });

  it("lets a valid token through", async () => {
    expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(true);
    expect(usersService.resolveByProviderSub).toHaveBeenCalledWith(providerSub, expect.any(Number));
  });

  it("says there was no token", async () => {
    expect(await verdictFor()).toEqual(rejection("Error: No auth token"));
  });

  it("says when an expired token expired, and what it claims", async () => {
    const exp = nowInSeconds() - 120;
    const verdict = await verdictFor(`Bearer ${signToken({ ...validClaims(), exp })}`);

    expect(verdict).toEqual(
      rejection(
        `TokenExpiredError: jwt expired at ${new Date(exp * 1000).toISOString()} (token claims issuer ${ISSUER}, audience ${AUDIENCE})`,
      ),
    );
  });

  it("says when a token becomes valid", async () => {
    const nbf = nowInSeconds() + 600;
    const verdict = await verdictFor(`Bearer ${signToken({ ...validClaims(), nbf })}`);

    expect(verdict).toEqual(
      rejection(
        `NotBeforeError: jwt not active until ${new Date(nbf * 1000).toISOString()} (token claims issuer ${ISSUER}, audience ${AUDIENCE})`,
      ),
    );
  });

  it("names the audience a token for another API claims, every one of them", async () => {
    const verdict = await verdictFor(
      `Bearer ${signToken({ ...validClaims(), aud: ["https://api.staging.example.com", `${ISSUER}userinfo`] })}`,
    );

    expect(verdict).toEqual(
      rejection(
        `JsonWebTokenError: jwt audience invalid. expected: ${AUDIENCE} (token claims issuer ${ISSUER}, audience https://api.staging.example.com ${ISSUER}userinfo)`,
      ),
    );
  });

  it("names the issuer a token from another tenant claims", async () => {
    const verdict = await verdictFor(`Bearer ${signToken({ ...validClaims(), iss: "https://other.auth0.com/" })}`);

    expect(verdict).toEqual(
      rejection(
        `JsonWebTokenError: jwt issuer invalid. expected: ${ISSUER} (token claims issuer https://other.auth0.com/, audience ${AUDIENCE})`,
      ),
    );
  });

  it("says which key id isn't in the key set, rather than blaming our config", async () => {
    const verdict = await verdictFor(`Bearer ${signToken(validClaims(), { kid: "rotated-away" })}`);

    expect(verdict).toEqual(
      rejection(
        `SigningKeyNotFoundError: Unable to find a signing key that matches 'rotated-away' (token claims issuer ${ISSUER}, audience ${AUDIENCE})`,
      ),
    );
  });

  it("says the signature doesn't match the key", async () => {
    const verdict = await verdictFor(`Bearer ${signToken(validClaims(), { privateKey: otherKey.privateKey })}`);

    expect(verdict).toEqual(
      rejection(`JsonWebTokenError: invalid signature (token claims issuer ${ISSUER}, audience ${AUDIENCE})`),
    );
  });

  it("says a token is malformed, with no claims it can't read", async () => {
    expect(await verdictFor("Bearer not-a-jwt")).toEqual(rejection("JsonWebTokenError: jwt malformed"));
  });

  it("passes on the reason an account can't sign in", async () => {
    const refusal = rejection("the account's deletion is in progress");
    usersService.resolveByProviderSub.mockRejectedValue(refusal);

    expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(refusal);
  });

  it("lets a server failure while resolving the user through as it is", async () => {
    const failure = new Error("Database unavailable");
    usersService.resolveByProviderSub.mockRejectedValue(failure);

    expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(failure);
  });

  describe("when the key set can't be fetched", () => {
    /** A 503, so the app keeps the session; the reason names what failed. */
    const expectUnavailable = (verdict: unknown, reason: string) => {
      expect(verdict).toBeInstanceOf(ServiceUnavailableException);
      expect(verdict).toMatchObject({ message: RESPONSE_TEMPLATES.SIGNING_KEYS_UNAVAILABLE(reason) });
    };

    it("answers 503, not a 401 that signs the user out, when the key server is unreachable", async () => {
      const closedServer = createServer();
      await new Promise<void>((resolve) => closedServer.listen(0, "127.0.0.1", resolve));
      const { port } = closedServer.address() as AddressInfo;
      await new Promise((resolve) => closedServer.close(resolve));
      useStrategyFetchingFrom(`http://127.0.0.1:${port}/.well-known/jwks.json`);

      expectUnavailable(
        await verdictFor(`Bearer ${signToken(validClaims())}`),
        `Error: connect ECONNREFUSED 127.0.0.1:${port}`,
      );
    });

    it("answers 503 when Auth0 answers the fetch with an error", async () => {
      answerKeySetRequest = (res) => {
        res.statusCode = 503;
        res.end();
      };

      expectUnavailable(await verdictFor(`Bearer ${signToken(validClaims())}`), "JwksError: Service Unavailable");
    });

    it("answers 503 for a real token once forged key ids have spent the fetch limit", async () => {
      for (const kid of ["forged-1", "forged-2", "forged-3", "forged-4", "forged-5"]) {
        expect(await verdictFor(`Bearer ${signToken(validClaims(), { kid })}`)).toBeInstanceOf(UnauthorizedException);
      }

      expectUnavailable(
        await verdictFor(`Bearer ${signToken(validClaims())}`),
        "JwksRateLimitError: Too many requests to the JWKS endpoint",
      );
    });
  });
});
