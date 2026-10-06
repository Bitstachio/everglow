import { PrismaClient, ReportActorRole } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { closeMemberReportsOnDeletedAccount, closeReportsOnDeletedPhotos } from "./report-closure";

/** The ids and reason escalateToPlatform passed to its raw UPDATE. */
const escalatedCall = (prisma: DeepMockProxy<PrismaClient>) => {
  const [, reason, ids] = prisma.$queryRaw.mock.calls[0] as unknown as [unknown, string, string[]];
  return { reason, ids };
};

describe("closeReportsOnDeletedPhotos", () => {
  const photoA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const photoB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const closerId = "11111111-1111-1111-1111-111111111111";
  const uploaderId = "22222222-2222-2222-2222-222222222222";
  let prisma: DeepMockProxy<PrismaClient>;

  const openReport = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    photoId: photoA,
    queue: "ORGANIZERS",
    reason: "SPAM",
    reporterId: "33333333-3333-3333-3333-333333333333",
    reportedUserId: uploaderId,
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.report.updateMany.mockResolvedValue({ count: 1 });
    prisma.$queryRaw.mockResolvedValue([]);
  });

  it("closes them all as ACTIONED, PHOTO_REMOVED when an organizer who may judge every one deletes the photo", async () => {
    prisma.report.findMany.mockResolvedValue([openReport("r-1"), openReport("r-2", { reason: "VIOLENCE" })] as never);

    await closeReportsOnDeletedPhotos(prisma, [photoA], { id: closerId, role: ReportActorRole.ORGANIZER });

    expect(prisma.report.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r-1", "r-2"] }, status: "OPEN" },
      data: {
        status: "ACTIONED",
        closedReason: "PHOTO_REMOVED",
        closedByRole: "ORGANIZER",
        resolvedById: closerId,
        resolvedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("closes them all as ACTIONED, PHOTO_REMOVED when the platform deletes the photo, whatever their queue", async () => {
    prisma.report.findMany.mockResolvedValue([openReport("r-1", { queue: "PLATFORM" })] as never);

    await closeReportsOnDeletedPhotos(prisma, [photoA], { id: closerId, role: ReportActorRole.PLATFORM });

    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIONED", closedByRole: "PLATFORM" }) as unknown,
      }),
    );
  });

  it("is no verdict when its uploader deletes it: minor reports close as TARGET_GONE, severe ones go to the platform", async () => {
    prisma.report.findMany.mockResolvedValue([
      openReport("minor"),
      openReport("severe", { reason: "NUDITY_OR_SEXUAL" }),
      openReport("already-platform", { queue: "PLATFORM" }),
    ] as never);
    prisma.$queryRaw.mockResolvedValue([{ id: "severe" }, { id: "already-platform" }]);

    const result = await closeReportsOnDeletedPhotos(prisma, [photoA], {
      id: uploaderId,
      role: ReportActorRole.SUBJECT,
    });

    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["minor"] }, status: "OPEN" },
      data: {
        status: "TARGET_GONE",
        closedReason: "PHOTO_DELETED",
        closedByRole: "SUBJECT",
        resolvedById: uploaderId,
        resolvedAt: expect.any(Date) as unknown,
      },
    });
    expect(escalatedCall(prisma)).toEqual({ reason: "TARGET_DELETED", ids: ["severe", "already-platform"] });
    expect(result.escalated).toHaveLength(2);
  });

  it.each([
    ["a report is with the platform", { queue: "PLATFORM" }],
    ["the organizer filed one", { reporterId: "11111111-1111-1111-1111-111111111111" }],
    ["one is about the organizer", { reportedUserId: "11111111-1111-1111-1111-111111111111" }],
  ])("is no verdict from an organizer when %s", async (_, overrides) => {
    prisma.report.findMany.mockResolvedValue([openReport("minor"), openReport("other", overrides)] as never);

    await closeReportsOnDeletedPhotos(prisma, [photoA], { id: closerId, role: ReportActorRole.ORGANIZER });

    expect(prisma.report.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIONED" }) as unknown }),
    );
  });

  it("judges each photo on its own reports", async () => {
    prisma.report.findMany.mockResolvedValue([
      openReport("on-a"),
      openReport("on-b", { photoId: photoB, queue: "PLATFORM" }),
    ] as never);

    await closeReportsOnDeletedPhotos(prisma, [photoA, photoB], { id: closerId, role: ReportActorRole.ORGANIZER });

    expect(prisma.report.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["on-a"] }, status: "OPEN" } }),
    );
    expect(escalatedCall(prisma).ids).toEqual(["on-b"]);
  });

  it("asks the database nothing when no photo is deleted", async () => {
    await expect(
      closeReportsOnDeletedPhotos(prisma, [], { id: closerId, role: ReportActorRole.SUBJECT }),
    ).resolves.toEqual({ closed: 0, escalated: [] });

    expect(prisma.report.findMany).not.toHaveBeenCalled();
  });

  it("changes nothing when the photos have no OPEN report", async () => {
    prisma.report.findMany.mockResolvedValue([]);

    await expect(
      closeReportsOnDeletedPhotos(prisma, [photoA], { id: closerId, role: ReportActorRole.SUBJECT }),
    ).resolves.toEqual({ closed: 0, escalated: [] });
    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });
});

describe("closeMemberReportsOnDeletedAccount", () => {
  const userId = "22222222-2222-2222-2222-222222222222";

  it("closes the account's minor member reports as TARGET_GONE and moves the severe ones to the platform", async () => {
    const prisma = mockDeep<PrismaClient>();
    prisma.report.updateMany.mockResolvedValue({ count: 2 });
    prisma.report.findMany.mockResolvedValue([{ id: "severe" }] as never);
    prisma.$queryRaw.mockResolvedValue([{ id: "severe" }]);

    await expect(closeMemberReportsOnDeletedAccount(prisma, userId)).resolves.toEqual({
      closed: 2,
      escalated: [{ id: "severe" }],
    });

    const memberReports = { reportedUserId: userId, targetType: "MEMBER", status: "OPEN" };
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: {
        ...memberReports,
        reason: { notIn: ["NUDITY_OR_SEXUAL", "VIOLENCE", "CHILD_SAFETY", "NON_CONSENSUAL_INTIMATE_IMAGE"] },
      },
      data: {
        status: "TARGET_GONE",
        closedReason: "ACCOUNT_DELETED",
        closedByRole: "SYSTEM",
        resolvedAt: expect.any(Date) as unknown,
      },
    });
    expect(prisma.report.findMany).toHaveBeenCalledWith({
      where: { ...memberReports, queue: "ORGANIZERS" },
      select: { id: true },
    });
    expect(escalatedCall(prisma)).toEqual({ reason: "TARGET_DELETED", ids: ["severe"] });
  });
});
