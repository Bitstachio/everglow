import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { PlatformRole } from "generated/prisma/client";
import type { Request } from "express";
import type { AuthenticatedUser } from "src/auth/auth.types";
import { ApiException } from "src/common/errors/api.exception";
import { PrismaService } from "src/prisma/prisma.service";

/**
 * Lets platform moderators through, after JwtAuthGuard (docs/moderation.md
 * §8). The role is read from the database on every request rather than from
 * the token, so revoking it takes effect at once.
 */
@Injectable()
export class PlatformModeratorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user) throw new ApiException("PLATFORM_MODERATOR_ONLY");

    const account = await this.prisma.user.findUnique({ where: { id: user.id }, select: { platformRole: true } });
    if (account?.platformRole !== PlatformRole.MODERATOR) throw new ApiException("PLATFORM_MODERATOR_ONLY");

    return true;
  }
}
