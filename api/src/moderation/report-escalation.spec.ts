import { PinoLogger } from "nestjs-pino";
import {
  PLATFORM_ESCALATIONS,
  escalationAlertFields,
  escalationSeverity,
  logEscalations,
  reasonEscalations,
} from "./report-escalation";

describe("report escalation", () => {
  const moved = {
    id: "r-1",
    eventId: "66666666-6666-6666-6666-666666666666",
    targetType: "PHOTO" as const,
    photoId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    reportedUserId: "22222222-2222-2222-2222-222222222222",
    reason: "SPAM" as const,
  };

  it.each([
    [["child_safety"], "page"],
    [["severe_reason", "intimate_image"], "page"],
    [["severe_reason"], "ticket"],
    [["target_is_event", "event_under_review"], "ticket"],
  ])("grades %j as a %s", (reasons, severity) => {
    expect(escalationSeverity(reasons)).toBe(severity);
  });

  it.each([
    ["SPAM", []],
    ["HARASSMENT", []],
    ["NUDITY_OR_SEXUAL", ["SEVERE_REASON"]],
    ["VIOLENCE", ["SEVERE_REASON"]],
    ["CHILD_SAFETY", ["SEVERE_REASON", "CHILD_SAFETY"]],
    ["NON_CONSENSUAL_INTIMATE_IMAGE", ["SEVERE_REASON", "INTIMATE_IMAGE"]],
  ] as const)("escalates a %s report for its reason alone with %j", (reason, expected) => {
    expect(reasonEscalations(reason)).toEqual(expected);
  });

  it("sends an automated report to the platform's queue", () => {
    expect(PLATFORM_ESCALATIONS).toContain("AUTOMATED_FLAG");
  });

  it("builds an alert line that names the report and no person", () => {
    expect(
      escalationAlertFields({ id: "r-1", eventId: null, reason: "CHILD_SAFETY", queue: "PLATFORM" }, [
        "severe_reason",
        "child_safety",
      ]),
    ).toEqual({
      event: "report.escalated",
      reportId: "r-1",
      eventId: null,
      reason: "CHILD_SAFETY",
      queue: "PLATFORM",
      escalationReasons: ["severe_reason", "child_safety"],
      severity: "page",
    });
  });

  it("logs each move as an audit line with the identities, then an alert line without them", () => {
    const logger = { info: jest.fn(), warn: jest.fn() };

    logEscalations(logger as unknown as PinoLogger, [moved], "TARGET_DELETED", { callerId: "c-1" });

    expect(logger.info).toHaveBeenCalledWith(
      {
        event: "report.moved_to_platform",
        reportId: "r-1",
        eventId: moved.eventId,
        targetType: "PHOTO",
        photoId: moved.photoId,
        reportedUserId: moved.reportedUserId,
        reason: "SPAM",
        escalationReasons: ["target_deleted"],
        callerId: "c-1",
        audit: true,
      },
      expect.any(String),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      {
        event: "report.escalated",
        reportId: "r-1",
        eventId: moved.eventId,
        reason: "SPAM",
        queue: "PLATFORM",
        escalationReasons: ["target_deleted"],
        severity: "ticket",
      },
      expect.any(String),
    );
  });
});
