import { generateKeyPairSync, verify } from "node:crypto";
import { signAppleClientSecret } from "./apple-client-secret";
import { APPLE_CLIENT_SECRET_MAX_TTL_SECONDS, APPLE_SIWA_ERRORS, APPLE_SIWA_ISSUER } from "./apple-siwa.constants";

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;

describe("signAppleClientSecret", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  const input = {
    teamId: "TEAM123456",
    keyId: "KEYID12345",
    clientId: "com.example.everglow",
    privateKey: privateKeyPem,
    issuedAt: 1_760_000_000,
  };

  it("produces an ES256 JWT with the header and claims Apple specifies", () => {
    const jwt = signAppleClientSecret(input);
    const [header, payload] = jwt.split(".");

    expect(decodeSegment(header)).toEqual({ alg: "ES256", kid: "KEYID12345" });
    expect(decodeSegment(payload)).toEqual({
      iss: "TEAM123456",
      iat: 1_760_000_000,
      exp: 1_760_000_300,
      aud: APPLE_SIWA_ISSUER,
      sub: "com.example.everglow",
    });
  });

  it("signs with the private key in the raw r||s form JWS requires", () => {
    const jwt = signAppleClientSecret(input);
    const [header, payload, signature] = jwt.split(".");

    const valid = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(valid).toBe(true);
    expect(Buffer.from(signature, "base64url")).toHaveLength(64);
  });

  it("honours a custom TTL", () => {
    const jwt = signAppleClientSecret({ ...input, ttlSeconds: 60 });
    expect(decodeSegment(jwt.split(".")[1]).exp).toBe(1_760_000_060);
  });

  it("refuses a TTL beyond Apple's six-month ceiling", () => {
    const ttlSeconds = APPLE_CLIENT_SECRET_MAX_TTL_SECONDS + 1;
    expect(() => signAppleClientSecret({ ...input, ttlSeconds })).toThrow(
      APPLE_SIWA_ERRORS.CLIENT_SECRET_TTL_TOO_LONG(ttlSeconds),
    );
  });

  it("rejects a key that is not a valid PEM private key", () => {
    expect(() => signAppleClientSecret({ ...input, privateKey: "not a key" })).toThrow();
  });
});
