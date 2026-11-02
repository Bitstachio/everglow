import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "src/users/users.service";
import { AuthenticatedUser } from "./auth.types";
import { JwtPayloadDto } from "./jwt-payload.dto";
import { SigningKeySet } from "./signing-key-set";

/** The token's header, read without verifying it; undefined when it isn't a JWT. */
const headerOf = (token: string): { kid?: unknown; alg?: unknown } | undefined => {
  try {
    const header: unknown = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));
    return typeof header === "object" && header !== null ? header : undefined;
  } catch {
    return undefined;
  }
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
    signingKeys: SigningKeySet,
  ) {
    const domain = configService.getOrThrow<string>("auth0.domain");
    const audience = configService.getOrThrow<string>("auth0.audience");

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: (
        _request: Request,
        rawJwtToken: string,
        done: (err: Error | null, key?: string) => void,
      ) => {
        const header = headerOf(rawJwtToken);
        // Not a JWT, or not RS256: no key, and jsonwebtoken says what is wrong with it.
        if (header?.alg !== "RS256") return done(null);

        // A key id the set doesn't have is the token's fault: refused with that
        // reason. No key set at all is ours (SigningKeysUnavailableError), and
        // the guard answers 503.
        signingKeys.keyFor(typeof header.kid === "string" ? header.kid : undefined).then(
          (key) => done(null, key),
          (error: Error) => done(error),
        );
      },
      audience,
      issuer: `https://${domain}/`,
      algorithms: ["RS256"],
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayloadDto): Promise<AuthenticatedUser> {
    // The issue time lets a tombstoned identity tell an old token from a new sign-in.
    const user = await this.usersService.resolveByProviderSub(payload.sub, payload.iat);
    return {
      id: user.id,
      sub: payload.sub,
      suspended: user.suspendedAt != null,
      deletionInProgress: user.deletionStartedAt != null,
    };
  }
}
