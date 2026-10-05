import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "src/users/users.service";
import { AuthenticatedUser } from "./auth.types";
import { JwtPayloadDto } from "./jwt-payload.dto";

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
        // Refuse a key id the key set doesn't have with that reason. The default
        // drops it, and jsonwebtoken then says "secret or public key must be
        // provided", which reads like our misconfiguration.
        handleSigningKeyError: (err, cb) => cb(err),
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
    return { id: user.id, sub: payload.sub };
  }
}
