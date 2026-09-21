import { REPORT_HIDE_THRESHOLD, SMALL_EVENT_REPORT_HIDE_THRESHOLD, reportHideThreshold } from "./moderation.constants";

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
