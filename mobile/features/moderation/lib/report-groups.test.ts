import type { ReportResponseDto } from "../types";
import { doneThisWeek, groupOpenReports, hideThreshold } from "./report-groups";

let next = 0;
const report = (overrides: Partial<ReportResponseDto> = {}): ReportResponseDto => ({
  id: `report-${++next}`,
  eventId: "event-1",
  eventTitle: "Sam & Jo’s wedding",
  targetType: "PHOTO",
  photoId: "photo-144",
  reportedUserId: "u-marcus",
  reason: "SPAM",
  note: null,
  status: "OPEN",
  queue: "ORGANIZERS",
  closedReason: null,
  closedByRole: null,
  resolvedById: null,
  resolvedAt: null,
  createdAt: "2026-10-30T10:00:00.000Z",
  ...overrides,
});

test("a small roll hides a frame after two reports, a larger one after three", () => {
  expect(hideThreshold(3)).toBe(2);
  expect(hideThreshold(4)).toBe(3);
});

test("reports on one frame are one decision, with the reason given most", () => {
  const [group, ...rest] = groupOpenReports(
    [report({ reason: "NUDITY_OR_SEXUAL" }), report({ reason: "NUDITY_OR_SEXUAL" }), report({ reason: "SPAM" })],
    24,
  );
  expect(rest).toHaveLength(0);
  expect(group).toMatchObject({ kind: "frame", reason: "NUDITY_OR_SEXUAL", reasonCount: 2, hidden: true });
  expect(group.reports).toHaveLength(3);
});

test("one spam report doesn't hide a frame; one for nudity does", () => {
  expect(groupOpenReports([report()], 24)[0].hidden).toBe(false);
  expect(groupOpenReports([report({ reason: "VIOLENCE" })], 24)[0].hidden).toBe(true);
});

test("a person's reports are their own group, and never hidden", () => {
  const groups = groupOpenReports(
    [
      report(),
      report({ targetType: "MEMBER", photoId: null, reason: "HARASSMENT", createdAt: "2026-10-31T00:00:00Z" }),
    ],
    24,
  );
  expect(groups.map((group) => group.key)).toEqual(["person:u-marcus", "frame:photo-144"]);
  expect(groups[0].hidden).toBe(false);
});

test("a frame whose reports are all with Everglow can't be decided by hosts", () => {
  const [group] = groupOpenReports([report({ queue: "PLATFORM" })], 24);
  expect(group.withEverglow).toBe(true);
  expect(group.actionable).toBeNull();
});

test("closed reports and reports about the roll stay off the list", () => {
  expect(
    groupOpenReports([report({ status: "DISMISSED" }), report({ targetType: "EVENT", photoId: null })], 24),
  ).toEqual([]);
});

test("done this week counts what closed in the last seven days", () => {
  const now = new Date("2026-10-31T12:00:00.000Z");
  expect(
    doneThisWeek(
      [
        report({ status: "ACTIONED", resolvedAt: "2026-10-30T12:00:00.000Z" }),
        report({ status: "DISMISSED", resolvedAt: "2026-10-20T12:00:00.000Z" }),
        report(),
      ],
      now,
    ),
  ).toBe(1);
});
