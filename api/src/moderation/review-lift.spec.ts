import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { liftReviewWhenEventReportsSettled } from "./review-lift";

describe("liftReviewWhenEventReportsSettled", () => {
  const eventId = "66666666-6666-6666-6666-666666666666";
  const underReviewAt = new Date("2026-10-30T12:00:00.000Z");
  let tx: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    tx = mockDeep<PrismaClient>();
  });

  it("lifts the review once no event report is OPEN, and says since when it ran", async () => {
    tx.$queryRaw.mockResolvedValue([{ underReviewAt }]);
    tx.report.count.mockResolvedValue(0);

    await expect(liftReviewWhenEventReportsSettled(tx, eventId)).resolves.toEqual(underReviewAt);

    expect(tx.report.count).toHaveBeenCalledWith({ where: { eventId, targetType: "EVENT", status: "OPEN" } });
    expect(tx.event.update).toHaveBeenCalledWith({ where: { id: eventId }, data: { underReviewAt: null } });
  });

  it("keeps the review while another event report is OPEN", async () => {
    tx.$queryRaw.mockResolvedValue([{ underReviewAt }]);
    tx.report.count.mockResolvedValue(1);

    await expect(liftReviewWhenEventReportsSettled(tx, eventId)).resolves.toBeNull();
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  it("does nothing for an event that isn't under review, or is gone", async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ underReviewAt: null }]).mockResolvedValueOnce([]);

    await expect(liftReviewWhenEventReportsSettled(tx, eventId)).resolves.toBeNull();
    await expect(liftReviewWhenEventReportsSettled(tx, eventId)).resolves.toBeNull();
    expect(tx.report.count).not.toHaveBeenCalled();
    expect(tx.event.update).not.toHaveBeenCalled();
  });
});
