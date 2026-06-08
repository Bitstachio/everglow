import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "src/users/users.service";
import { JwtPayloadDto } from "./jwt-payload.dto";
import { AuthenticatedUser } from "./auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    const secret = configService.get<string>("jwt.secret");
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || "",
    });
  }

  async validate(payload: JwtPayloadDto): Promise<AuthenticatedUser> {
    const user = await this.usersService.resolveByProviderSub(payload.sub);
    if (!user) throw new UnauthorizedException("No user found for this identity");
    return { id: user.id, sub: payload.sub, email: user.email };
  }
}
