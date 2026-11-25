import type { ReportResponseDto } from "../types";
import { doneThisWeek, groupOpenReports, hideThreshold, toCheckCount } from "./report-groups";

let next = 0;
const report = (overrides: Partial<ReportResponseDto> = {}): ReportResponseDto => ({
  id: `report-${++next}`,
  eventId: "event-1",
  eventTitle: "Sam & Jo’s wedding",
  source: "USER",
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

test("an automated report hides a frame whatever its reason, and the group says it was automatic", () => {
  const [group] = groupOpenReports([report({ source: "AUTOMATED", reason: "HARASSMENT", queue: "PLATFORM" })], 24);
  expect(group).toMatchObject({ hidden: true, automated: true, withEverglow: true });
  expect(groupOpenReports([report()], 24)[0].automated).toBe(false);
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
  expect(group.decidable).toEqual([]);
  expect(toCheckCount([group])).toBe(0);
});

test("hosts decide a frame on the reports still with them, even when some went to Everglow", () => {
  const withHosts = report();
  const [group] = groupOpenReports([report({ queue: "PLATFORM" }), withHosts], 24);
  expect(group.withEverglow).toBe(false);
  expect(group.decidable).toEqual([withHosts]);
  expect(toCheckCount([group])).toBe(1);
});

test("reports whose frame or person is gone stand alone instead of merging", () => {
  const groups = groupOpenReports(
    [
      report({ id: "a", photoId: null, queue: "PLATFORM" }),
      report({ id: "b", photoId: null, queue: "PLATFORM" }),
      report({ id: "c", targetType: "MEMBER", photoId: null, reportedUserId: null, reason: "VIOLENCE" }),
    ],
    24,
  );
  expect(groups.map((group) => group.key)).toEqual(["report:a", "report:b", "report:c"]);
  expect(groups[2].kind).toBe("person");
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
