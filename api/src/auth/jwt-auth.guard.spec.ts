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
import { Reflector } from "@nestjs/core";
import { PinoLogger } from "nestjs-pino";
import { AllowDeletionInProgress, AllowSuspended } from "./allow-suspended.decorator";
import { SigningKeySet } from "./signing-key-set";

// jwks-rsa's jose can't load under Jest; see testing/jose-stand-in.ts.
jest.mock(require.resolve("jose", { paths: [require.resolve("jwks-rsa")] }), () =>
  jest.requireActual<typeof import("./testing/jose-stand-in")>("./testing/jose-stand-in"),
);

/**
 * Runs the real chain: passport, passport-jwt, SigningKeySet fetching our key
 * set from a local server through jwks-rsa, and jsonwebtoken, against tokens
 * signed here.
 */
describe("JwtAuthGuard", () => {
  const ISSUER = "https://test.example.auth0.com/";
  const AUDIENCE = "https://api.test.example.com";
  const NATIVE_CLIENT_ID = "native-app-client-id";
  const KEY_ID = "test-key";
  const userId = "11111111-1111-1111-1111-111111111111";
  const providerSub = "auth0|abc123";

  const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

  let keySetServer: Server;
  let jwksUri: string;
  let answerKeySetRequest: (res: ServerResponse) => void;
  let keySetFetches: number;
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
    azp: NATIVE_CLIENT_ID,
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

  /** Registers a strategy with passport as "jwt", with a fresh key set that has never been fetched. */
  const useStrategyFetchingFrom = (uri: string) => {
    const config: Record<string, string> = {
      "auth0.domain": "test.example.auth0.com",
      "auth0.audience": AUDIENCE,
      "auth0.jwksUri": uri,
      "auth0.nativeClientId": NATIVE_CLIENT_ID,
    };
    const configService = { getOrThrow: (key: string) => config[key] } as unknown as ConfigService;
    new JwtStrategy(configService, usersService, new SigningKeySet(configService, mockDeep<PinoLogger>()));
  };

  beforeAll(async () => {
    keySetServer = createServer((_req, res) => {
      keySetFetches += 1;
      answerKeySetRequest(res);
    });
    await new Promise<void>((resolve) => keySetServer.listen(0, "127.0.0.1", resolve));
    jwksUri = `http://127.0.0.1:${(keySetServer.address() as AddressInfo).port}/.well-known/jwks.json`;
  });

  afterAll(async () => {
    await new Promise((resolve) => keySetServer.close(resolve));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    answerKeySetRequest = serveKeySet;
    keySetFetches = 0;
    usersService = mockDeep<UsersService>();
    usersService.resolveByProviderSub.mockResolvedValue({ id: userId, providerSub } as UserWithDetails);
    useStrategyFetchingFrom(jwksUri);
    guard = new JwtAuthGuard(new Reflector());
  });

  it("lets a valid token through", async () => {
    expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(true);
    expect(usersService.resolveByProviderSub).toHaveBeenCalledWith(providerSub, expect.any(Number));
  });

  it("refuses a machine-to-machine token signed by the tenant with 401, and provisions nobody", async () => {
    const claims = { ...validClaims(), sub: "m2m-client@clients", azp: "m2m-client", gty: "client-credentials" };

    expect(await verdictFor(`Bearer ${signToken(claims)}`)).toEqual(
      rejection("a client-credentials (machine-to-machine) token"),
    );
    expect(usersService.resolveByProviderSub).not.toHaveBeenCalled();
  });

  it("refuses a token another application of the tenant was issued with 401", async () => {
    expect(await verdictFor(`Bearer ${signToken({ ...validClaims(), azp: "web-client" })}`)).toEqual(
      rejection("issued to client web-client, not the app"),
    );
    expect(usersService.resolveByProviderSub).not.toHaveBeenCalled();
  });

  it("refuses a suspended account with 403 ACCOUNT_SUSPENDED on a route that doesn't allow it", async () => {
    usersService.resolveByProviderSub.mockResolvedValue({
      id: userId,
      providerSub,
      suspendedAt: new Date(),
    } as UserWithDetails);
    const request = { headers: { authorization: `Bearer ${signToken(validClaims())}` } };
    const handler = () => undefined;
    const context = new ExecutionContextHost([request, {}], class Plain {}, handler);

    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: "ACCOUNT_SUSPENDED" } });
  });

  it("lets a suspended account through a route marked @AllowSuspended()", async () => {
    usersService.resolveByProviderSub.mockResolvedValue({
      id: userId,
      providerSub,
      suspendedAt: new Date(),
    } as UserWithDetails);
    const request = { headers: { authorization: `Bearer ${signToken(validClaims())}` } };
    const handler = () => undefined;
    AllowSuspended()(handler, "handler", { value: handler });
    const context = new ExecutionContextHost([request, {}], class Plain {}, handler);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  describe("an account whose deletion has started", () => {
    const deleting = () =>
      usersService.resolveByProviderSub.mockResolvedValue({
        id: userId,
        providerSub,
        deletionStartedAt: new Date(),
      } as UserWithDetails);
    const contextFor = (handler: () => void) =>
      new ExecutionContextHost(
        [{ headers: { authorization: `Bearer ${signToken(validClaims())}` } }, {}],
        class Plain {},
        handler,
      );

    it("is refused with 401 ACCOUNT_DELETION_IN_PROGRESS, a code the app can read", async () => {
      deleting();

      await expect(guard.canActivate(contextFor(() => undefined))).rejects.toMatchObject({
        status: 401,
        response: { code: "ACCOUNT_DELETION_IN_PROGRESS" },
      });
    });

    it("is refused even on a route a suspended account may use", async () => {
      deleting();
      const handler = () => undefined;
      AllowSuspended()(handler, "handler", { value: handler });

      await expect(guard.canActivate(contextFor(handler))).rejects.toMatchObject({
        response: { code: "ACCOUNT_DELETION_IN_PROGRESS" },
      });
    });

    it("may ask for its deletion again on a route marked @AllowDeletionInProgress()", async () => {
      deleting();
      const handler = () => undefined;
      AllowDeletionInProgress()(handler, "handler", { value: handler });

      await expect(guard.canActivate(contextFor(handler))).resolves.toBe(true);
    });
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

  it("refuses a flood of forged key ids with 401 and no fetch, and a real token still passes", async () => {
    expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(true);

    for (let i = 0; i < 20; i += 1) {
      expect(await verdictFor(`Bearer ${signToken(validClaims(), { kid: `forged-${i}` })}`)).toBeInstanceOf(
        UnauthorizedException,
      );
    }

    expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(true);
    expect(keySetFetches).toBe(1);
  });

  it("says a token that names no key id has none, without fetching", async () => {
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(validClaims())}`;
    const token = `${unsigned}.${sign("sha256", Buffer.from(unsigned), signingKey.privateKey).toString("base64url")}`;

    expect(await verdictFor(`Bearer ${token}`)).toEqual(
      rejection(
        `SigningKeyNotFoundError: The token names no signing key (no kid) (token claims issuer ${ISSUER}, audience ${AUDIENCE})`,
      ),
    );
    expect(keySetFetches).toBe(0);
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
    const refusal = rejection("the token was issued before this identity's account was deleted");
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

    it("keeps the key set it loaded, and its tokens pass, when a later fetch fails", async () => {
      expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(true);
      answerKeySetRequest = (res) => {
        res.statusCode = 503;
        res.end();
      };
      const now = Date.now();
      jest.spyOn(Date, "now").mockReturnValue(now + 31_000);

      // Past the cooldown an unknown key id refetches, which fails: still the token's 401, not a 503.
      expect(await verdictFor(`Bearer ${signToken(validClaims(), { kid: "new-key" })}`)).toBeInstanceOf(
        UnauthorizedException,
      );
      expect(await verdictFor(`Bearer ${signToken(validClaims())}`)).toBe(true);
      expect(keySetFetches).toBe(2);
    });
  });
});
