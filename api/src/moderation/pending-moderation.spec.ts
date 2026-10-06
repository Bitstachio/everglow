import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { lockPendingModeration } from "./pending-moderation";

describe("lockPendingModeration", () => {
  const eventId = "11111111-1111-1111-1111-111111111111";
  let tx: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    tx = mockDeep<PrismaClient>();
    tx.$queryRaw.mockResolvedValue([{ underReviewAt: null }]);
    tx.report.count.mockResolvedValue(0);
  });

  it("locks the event row FOR UPDATE", async () => {
    await lockPendingModeration(tx, eventId);

    const [strings, ...values] = tx.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toMatch(/FROM "Event" WHERE "id" = \?::uuid FOR UPDATE/);
    expect(values).toEqual([eventId]);
  });

  it("is null for an event moderation doesn't need", async () => {
    await expect(lockPendingModeration(tx, eventId)).resolves.toBeNull();
    expect(tx.report.count).toHaveBeenCalledWith({ where: { eventId, status: "OPEN" } });
  });

  it("says EVENT_UNDER_REVIEW for an event under review, without counting reports", async () => {
    tx.$queryRaw.mockResolvedValue([{ underReviewAt: new Date() }]);

    await expect(lockPendingModeration(tx, eventId)).resolves.toBe("EVENT_UNDER_REVIEW");
    expect(tx.report.count).not.toHaveBeenCalled();
  });

  it("says EVENT_HAS_OPEN_REPORTS while any report about the event is OPEN", async () => {
    tx.report.count.mockResolvedValue(1);

    await expect(lockPendingModeration(tx, eventId)).resolves.toBe("EVENT_HAS_OPEN_REPORTS");
  });

  it("is null for an event that no longer exists", async () => {
    tx.$queryRaw.mockResolvedValue([]);

    await expect(lockPendingModeration(tx, eventId)).resolves.toBeNull();
  });
});
