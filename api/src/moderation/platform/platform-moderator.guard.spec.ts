import { ExecutionContext } from "@nestjs/common";
import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { PlatformModeratorGuard } from "./platform-moderator.guard";

describe("PlatformModeratorGuard", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  let prisma: DeepMockProxy<PrismaClient>;
  let guard: PlatformModeratorGuard;

  const contextFor = (user?: { id: string }) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    guard = new PlatformModeratorGuard(prisma as unknown as PrismaService);
  });

  it("lets a platform moderator through, reading the role from the database", async () => {
    prisma.user.findUnique.mockResolvedValue({ platformRole: "MODERATOR" } as never);

    await expect(guard.canActivate(contextFor({ id: userId }))).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: userId }, select: { platformRole: true } });
  });

  it.each([
    ["an ordinary user", { platformRole: null }],
    ["an account that no longer exists", null],
  ])("refuses %s with 403 PLATFORM_MODERATOR_ONLY", async (_, account) => {
    prisma.user.findUnique.mockResolvedValue(account as never);

    await expect(guard.canActivate(contextFor({ id: userId }))).rejects.toMatchObject({
      response: { code: "PLATFORM_MODERATOR_ONLY" },
    });
  });

  it("refuses a request with no authenticated user", async () => {
    await expect(guard.canActivate(contextFor())).rejects.toMatchObject({
      response: { code: "PLATFORM_MODERATOR_ONLY" },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
