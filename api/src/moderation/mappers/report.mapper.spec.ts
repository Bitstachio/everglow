import { Report } from "generated/prisma/client";
import { ReportMapper } from "./report.mapper";

describe("ReportMapper", () => {
  const now = new Date("2026-06-10T12:00:00.000Z");

  const report: Report = {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    eventId: "66666666-6666-6666-6666-666666666666",
    reporterId: "11111111-1111-1111-1111-111111111111",
    targetType: "PHOTO",
    photoId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    reportedUserId: "22222222-2222-2222-2222-222222222222",
    reason: "SPAM",
    note: "Keeps posting ads",
    status: "DISMISSED",
    resolvedById: "33333333-3333-3333-3333-333333333333",
    resolvedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  describe("toResponseDto", () => {
    it("maps the report fields", () => {
      expect(ReportMapper.toResponseDto(report)).toEqual({
        id: report.id,
        eventId: report.eventId,
        targetType: "PHOTO",
        photoId: report.photoId,
        reportedUserId: report.reportedUserId,
        reason: "SPAM",
        note: report.note,
        status: "DISMISSED",
        resolvedById: report.resolvedById,
        resolvedAt: now,
        createdAt: now,
      });
    });

    it("never exposes who filed the report", () => {
      expect(ReportMapper.toResponseDto(report)).not.toHaveProperty("reporterId");
    });
  });

  describe("toListResponseDto", () => {
    it("maps each report and carries the cursor over", () => {
      const result = ReportMapper.toListResponseDto({ items: [report, report], nextCursor: "next" });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).not.toHaveProperty("reporterId");
      expect(result.nextCursor).toBe("next");
    });
  });
});
