import {
  REPORT_HIDE_THRESHOLD,
  SMALL_EVENT_REPORT_HIDE_THRESHOLD,
  reportHideThreshold,
  underReviewThreshold,
} from "./moderation.constants";

describe("reportHideThreshold", () => {
  it.each([
    [1, SMALL_EVENT_REPORT_HIDE_THRESHOLD],
    [2, SMALL_EVENT_REPORT_HIDE_THRESHOLD],
    // Uploader plus two others: three reports could never be collected.
    [3, SMALL_EVENT_REPORT_HIDE_THRESHOLD],
    // Uploader plus three others: the default becomes reachable.
    [4, REPORT_HIDE_THRESHOLD],
    [250, REPORT_HIDE_THRESHOLD],
  ])("an event of %i members hides a photo at %i open reports", (memberCount, expected) => {
    expect(reportHideThreshold(memberCount)).toBe(expected);
  });

  it("never lets a single report hide a photo from everyone", () => {
    expect(SMALL_EVENT_REPORT_HIDE_THRESHOLD).toBeGreaterThan(1);
  });
});

describe("underReviewThreshold", () => {
  it.each([
    [3, SMALL_EVENT_REPORT_HIDE_THRESHOLD],
    [4, REPORT_HIDE_THRESHOLD],
    [30, REPORT_HIDE_THRESHOLD],
    // Above 30 members, a tenth of them, rounded up.
    [31, 4],
    [100, 10],
    [300, 30],
  ])("an event of %i members goes under review at %i open reports, none severe", (memberCount, expected) => {
    expect(underReviewThreshold(memberCount, "none")).toBe(expected);
  });

  it.each([3, 4, 100, 300])(
    "stays at the photo hide threshold for %i members once any report is severe",
    (memberCount) => {
      expect(underReviewThreshold(memberCount, "severe")).toBe(reportHideThreshold(memberCount));
    },
  );

  it.each([3, 4, 100, 300])(
    "needs a single child-safety or intimate-image report, whatever the size (%i members)",
    (memberCount) => {
      expect(underReviewThreshold(memberCount, "platform_only")).toBe(1);
    },
  );
});
