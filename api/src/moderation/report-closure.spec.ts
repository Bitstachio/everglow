import { PrismaClient, ReportActorRole } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { closeMemberReportsOnDeletedAccount, closeReportsOnDeletedPhotos } from "./report-closure";

describe("closeReportsOnDeletedPhotos", () => {
  const photoIds = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"];
  const closerId = "11111111-1111-1111-1111-111111111111";
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.report.updateMany.mockResolvedValue({ count: 3 });
  });

  it.each([ReportActorRole.ORGANIZER, ReportActorRole.PLATFORM])(
    "closes them as ACTIONED, PHOTO_REMOVED when the %s deletes the photo: that is a verdict",
    async (role) => {
      await expect(closeReportsOnDeletedPhotos(prisma, photoIds, { id: closerId, role })).resolves.toBe(3);

      expect(prisma.report.updateMany).toHaveBeenCalledWith({
        where: { photoId: { in: photoIds }, status: "OPEN" },
        data: {
          status: "ACTIONED",
          closedReason: "PHOTO_REMOVED",
          closedByRole: role,
          resolvedById: closerId,
          resolvedAt: expect.any(Date) as unknown,
        },
      });
    },
  );

  it.each([ReportActorRole.SUBJECT, ReportActorRole.SYSTEM])(
    "closes them as TARGET_GONE, PHOTO_DELETED when the %s deletes it: no verdict",
    async (role) => {
      await closeReportsOnDeletedPhotos(prisma, photoIds, { id: closerId, role });

      expect(prisma.report.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "TARGET_GONE",
            closedReason: "PHOTO_DELETED",
            closedByRole: role,
          }) as unknown,
        }),
      );
    },
  );

  it("asks the database nothing when no photo is deleted", async () => {
    await expect(
      closeReportsOnDeletedPhotos(prisma, [], { id: closerId, role: ReportActorRole.SUBJECT }),
    ).resolves.toBe(0);

    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });
});

describe("closeMemberReportsOnDeletedAccount", () => {
  const userId = "22222222-2222-2222-2222-222222222222";

  it("closes the account's OPEN member reports that aren't severe as TARGET_GONE, ACCOUNT_DELETED", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.report.updateMany.mockResolvedValue({ count: 2 });

    await expect(closeMemberReportsOnDeletedAccount(prisma, userId)).resolves.toBe(2);

    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: {
        reportedUserId: userId,
        targetType: "MEMBER",
        status: "OPEN",
        reason: { notIn: ["NUDITY_OR_SEXUAL", "VIOLENCE"] },
      },
      data: {
        status: "TARGET_GONE",
        closedReason: "ACCOUNT_DELETED",
        closedByRole: "SYSTEM",
        resolvedAt: expect.any(Date) as unknown,
      },
    });
  });
});
