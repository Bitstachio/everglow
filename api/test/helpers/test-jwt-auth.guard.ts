import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { AuthenticatedUser } from "src/auth/auth.types";
import { TEST_PROVIDER_SUB, TEST_USER_ID } from "./users.fixtures";

export const TEST_AUTH_HEADER = "authorization";

/**
 * Lightweight JWT stand-in for E2E tests.
 * Accepts any non-empty Bearer token and attaches a fixed authenticated user.
 */
@Injectable()
export class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const authorization = request.headers[TEST_AUTH_HEADER];

    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authorization.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedException();
    }

    request.user = { id: TEST_USER_ID, sub: TEST_PROVIDER_SUB };
    return true;
  }
}
