import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedUser } from "src/auth/auth.types";
import { RESPONSE_TEMPLATES } from "src/common/constants/templates.constants";
import { resolveAuthenticatedUser } from "./auth.fixtures";

export const TEST_AUTH_HEADER = "authorization";

/**
 * Lightweight JWT stand-in for HTTP integration tests.
 * Maps known Bearer tokens to authenticated users; defaults to the primary test user.
 */
@Injectable()
export class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = request.headers[TEST_AUTH_HEADER];

    const token =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";
    if (!token) {
      // Passport's own reason when there is no token.
      throw new UnauthorizedException(RESPONSE_TEMPLATES.TOKEN_REJECTED("Error: No auth token"));
    }

    request.user = resolveAuthenticatedUser(token);
    return true;
  }
}
