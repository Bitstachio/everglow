import { ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { ApiException } from "src/common/errors/api.exception";
import { ALLOW_SUSPENDED_KEY } from "./allow-suspended.decorator";
import { AuthenticatedUser } from "./auth.types";
import { Request } from "express";
import { ExtractJwt } from "passport-jwt";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { SigningKeysUnavailableError } from "./signing-keys-unavailable.error";

/**
 * Why passport refused the token: "No auth token", jsonwebtoken's verdict
 * ("jwt expired", "invalid signature", "jwt audience invalid. expected: …"),
 * or the key lookup's ("Unable to find a signing key that matches '…'"). An
 * expired or not-yet-valid token also says when.
 */
const refusalOf = (info: unknown): string => {
  if (!(info instanceof Error)) return "passport gave no reason";

  const { expiredAt, date } = info as Error & { expiredAt?: unknown; date?: unknown };
  if (expiredAt instanceof Date) return `${info.name}: ${info.message} at ${expiredAt.toISOString()}`;
  if (date instanceof Date) return `${info.name}: ${info.message} until ${date.toISOString()}`;
  return `${info.name}: ${info.message}`;
};

/**
 * The issuer and audience the token claims, read without verifying it and used
 * for nothing but the log line. A client signed in against the wrong Auth0
 * tenant or API shows up here, where a bad signature alone wouldn't say why.
 */
const claimedOriginOf = (token: string): string | undefined => {
  try {
    const payload = Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8");
    const { iss, aud } = JSON.parse(payload) as { iss?: unknown; aud?: unknown };
    const audiences = [aud].flat().filter((value): value is string => typeof value === "string");
    return `issuer ${typeof iss === "string" ? iss : "none"}, audience ${audiences.join(" ") || "none"}`;
  } catch {
    return undefined;
  }
};

/**
 * `AuthGuard("jwt")` with a reason on every 401. Passport tells the guard why
 * it refused the token, and the default `handleRequest` drops that for a bare
 * 401. The reason only reaches the request's log line: the client gets
 * `UNAUTHORIZED` and signs in again. A token we couldn't check at all is a 503
 * instead, so an Auth0 outage doesn't sign everyone out.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false, info: unknown, context: ExecutionContext): TUser {
    // validate() threw: a 401 that already has its reason, or a server failure.
    if (err) throw err;
    if (user) {
      // A suspended account reads and deletes itself, nothing else (docs/moderation.md §8).
      if ((user as unknown as AuthenticatedUser).suspended && !this.allowsSuspended(context)) {
        throw new ApiException("ACCOUNT_SUSPENDED");
      }
      return user;
    }

    if (info instanceof SigningKeysUnavailableError) {
      throw new ServiceUnavailableException(RESPONSE_TEMPLATES.SIGNING_KEYS_UNAVAILABLE(info.message), {
        cause: info.cause,
      });
    }

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(context.switchToHttp().getRequest<Request>());
    const origin = token ? claimedOriginOf(token) : undefined;
    const refusal = refusalOf(info);
    throw new UnauthorizedException(
      RESPONSE_TEMPLATES.TOKEN_REJECTED(origin ? `${refusal} (token claims ${origin})` : refusal),
    );
  }

  private allowsSuspended(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(ALLOW_SUSPENDED_KEY, [context.getHandler(), context.getClass()]) ===
      true
    );
  }
}
