import { createPrivateKey, sign } from "node:crypto";
import {
  APPLE_CLIENT_SECRET_MAX_TTL_SECONDS,
  APPLE_CLIENT_SECRET_TTL_SECONDS,
  APPLE_SIWA_ERRORS,
  APPLE_SIWA_ISSUER,
} from "./apple-siwa.constants";

export interface AppleClientSecretInput {
  /** 10-character Apple Developer Team ID; becomes `iss`. */
  teamId: string;
  /** 10-character Key ID of the Sign in with Apple private key; becomes the `kid` header. */
  keyId: string;
  /** App ID (bundle identifier) or Services ID the user authorised against; becomes `sub`. */
  clientId: string;
  /** PEM contents of the .p8 key. */
  privateKey: string;
  /** Unix seconds; defaults to now. */
  issuedAt?: number;
  ttlSeconds?: number;
}

const base64url = (input: string | Buffer): string => Buffer.from(input).toString("base64url");

/**
 * Mints the `client_secret` Apple's REST endpoints expect: an ES256 JWT signed
 * with the Sign in with Apple private key. Small enough that a JWT library is
 * not worth a dependency; the shape is fixed by Apple and covered by tests.
 */
export const signAppleClientSecret = ({
  teamId,
  keyId,
  clientId,
  privateKey,
  issuedAt = Math.floor(Date.now() / 1000),
  ttlSeconds = APPLE_CLIENT_SECRET_TTL_SECONDS,
}: AppleClientSecretInput): string => {
  if (ttlSeconds > APPLE_CLIENT_SECRET_MAX_TTL_SECONDS) {
    throw new Error(APPLE_SIWA_ERRORS.CLIENT_SECRET_TTL_TOO_LONG(ttlSeconds));
  }

  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    aud: APPLE_SIWA_ISSUER,
    sub: clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  // JWS wants the raw r||s signature, not the DER encoding node produces by default.
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${signature.toString("base64url")}`;
};
