import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "src/auth/auth.types";
import { USER_SERVICE_ERRORS } from "../users.constants";

@Injectable()
export class OnboardedGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();

    if (!user.isOnboarded) throw new ForbiddenException(USER_SERVICE_ERRORS.ONBOARDING_INCOMPLETE);

    return true;
  }
}
