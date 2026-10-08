import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "src/users/users.service";
import { AuthenticatedUser } from "./auth.types";
import { JwtPayloadDto } from "./jwt-payload.dto";
import { SigningKeysUnavailableError } from "./signing-keys-unavailable.error";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    const domain = configService.getOrThrow<string>("auth0.domain");
    const audience = configService.getOrThrow<string>("auth0.audience");
    const jwksUri = configService.getOrThrow<string>("auth0.jwksUri");

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
        // A key id the key set doesn't have is the token's fault: refuse it with
        // that reason. The default drops it, and jsonwebtoken then says "secret
        // or public key must be provided", which reads like our misconfiguration.
        // Failing to fetch the key set at all is ours, and the guard answers 503.
        handleSigningKeyError: (err, cb) =>
          cb(err && err.name !== "SigningKeyNotFoundError" ? new SigningKeysUnavailableError(err) : err),
      }),
      audience,
      issuer: `https://${domain}/`,
      algorithms: ["RS256"],
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayloadDto): Promise<AuthenticatedUser> {
    // The issue time lets a tombstoned identity tell an old token from a new sign-in.
    const user = await this.usersService.resolveByProviderSub(payload.sub, payload.iat);
    return { id: user.id, sub: payload.sub, suspended: user.suspendedAt != null };
  }
}
