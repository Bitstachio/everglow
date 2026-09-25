import { Report, ReportReason, ReportStatus, ReportTargetType } from "generated/prisma/client";
import { BlockWithBlockedUser } from "src/moderation/moderation.types";
import { TEST_TARGET_USER_ID } from "./auth.fixtures";
import { TEST_EVENT_ID, buildTargetUserWithDetails } from "./events.fixtures";
import { TEST_PHOTO_ID } from "./photos.fixtures";
import { TEST_NOW, TEST_USER_ID } from "./users.fixtures";

export const TEST_REPORT_ID = "dddddddd-1111-4222-8333-dddddddddddd";
export const TEST_BLOCK_ID = "b10cb10c-b10c-4b10-8b10-b10cb10cb10c";

/** An OPEN report by the primary test user on the target user's photo. */
export const buildReport = (overrides: Partial<Report> = {}): Report => ({
  id: TEST_REPORT_ID,
  eventId: TEST_EVENT_ID,
  reporterId: TEST_USER_ID,
  targetType: ReportTargetType.PHOTO,
  photoId: TEST_PHOTO_ID,
  reportedUserId: TEST_TARGET_USER_ID,
  reason: ReportReason.SPAM,
  note: null,
  status: ReportStatus.OPEN,
  resolvedById: null,
  resolvedAt: null,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

export const buildMemberReport = (overrides: Partial<Report> = {}): Report =>
  buildReport({ targetType: ReportTargetType.MEMBER, photoId: null, ...overrides });

/** The response never carries `reporterId`. */
export const expectedReportResponse = (report: Report) => ({
  id: report.id,
  eventId: report.eventId,
  targetType: report.targetType,
  photoId: report.photoId,
  reportedUserId: report.reportedUserId,
  reason: report.reason,
  note: report.note,
  status: report.status,
  resolvedById: report.resolvedById,
  resolvedAt: report.resolvedAt?.toISOString() ?? null,
  createdAt: report.createdAt.toISOString(),
});

/** The primary test user's block on the target user. */
export const buildBlock = (overrides: Partial<BlockWithBlockedUser> = {}): BlockWithBlockedUser => ({
  id: TEST_BLOCK_ID,
  blockerId: TEST_USER_ID,
  blockedId: TEST_TARGET_USER_ID,
  createdAt: TEST_NOW,
  blocked: buildTargetUserWithDetails(),
  ...overrides,
});
