import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { closeReportsOnDeletedPhotos } from "./report-closure";

describe("closeReportsOnDeletedPhotos", () => {
  const photoIds = ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"];
  const closedById = "11111111-1111-1111-1111-111111111111";
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
  });

  it("closes every OPEN report on the photos as ACTIONED and returns how many", async () => {
    prisma.report.updateMany.mockResolvedValue({ count: 3 });

    await expect(closeReportsOnDeletedPhotos(prisma, photoIds, closedById)).resolves.toBe(3);

    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { photoId: { in: photoIds }, status: "OPEN" },
      data: { status: "ACTIONED", resolvedById: closedById, resolvedAt: expect.any(Date) as unknown },
    });
  });

  it("asks the database nothing when no photo is deleted", async () => {
    await expect(closeReportsOnDeletedPhotos(prisma, [], closedById)).resolves.toBe(0);

    expect(prisma.report.updateMany).not.toHaveBeenCalled();
  });
});
