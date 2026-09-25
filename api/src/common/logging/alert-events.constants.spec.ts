import { ALERT_EVENTS } from "./alert-events.constants";

describe("ALERT_EVENTS", () => {
  // These strings are what the alert rules in the log platform match on. If
  // this test fails, an emitted event name changed: that is only safe when the
  // alert rules and docs/alerting.md are updated in the same change. Do not
  // just update the expectation.
  it("pins the exact event names alert rules key off", () => {
    expect(ALERT_EVENTS).toEqual({
      REQUEST_UNHANDLED_ERROR: "request.unhandled_error",
      RATE_LIMIT_EXCEEDED: "rate_limit.exceeded",

      ACCOUNT_DELETION_ABANDONED: "user.account.deletion_abandoned",
      ACCOUNT_DELETION_STUCK: "user.account.deletion_stuck",
      ACCOUNT_DELETION_RECONCILER_DISABLED: "user.account.deletion_reconciler.disabled",
      APPLE_REVOCATION_SKIPPED: "user.account.apple_revocation_skipped",
      APPLE_REVOCATION_FAILED: "user.account.apple_revocation_failed",

      ACCOUNT_PHOTOS_PURGED: "user.account.photos_purged",
      EVENT_PHOTOS_PURGED: "event.photos.purged",
      EVENT_MEMBER_PHOTOS_PURGED: "event.member.photos_purged",
      STORAGE_RESERVATION_CONFLICT: "photo.storage.reservation_conflict",
      UPLOAD_SLOTS_PRESIGN_FAILED: "photo.upload_slots.presign_failed",
      UPLOAD_SLOTS_REJECTED: "photo.upload_slots.rejected",

      REPORT_ESCALATED: "report.escalated",
      REPORT_STALE: "report.stale",

      ACCOUNT_DELETION_RECONCILE_RUN_COMPLETED: "user.account.deletion_reconcile.run_completed",
      ACCOUNT_DELETION_RECONCILE_RUN_FAILED: "user.account.deletion_reconcile.run_failed",
      PHOTO_PENDING_CLEANUP_RUN_COMPLETED: "photo.pending_cleanup.run_completed",
      PHOTO_PENDING_CLEANUP_RUN_FAILED: "photo.pending_cleanup.run_failed",
      S3_ORPHAN_RECONCILE_RUN_COMPLETED: "storage.orphan_reconcile.run_completed",
      S3_ORPHAN_RECONCILE_RUN_FAILED: "storage.orphan_reconcile.run_failed",
      STALE_REPORT_CHECK_RUN_COMPLETED: "report.stale_check.run_completed",
      STALE_REPORT_CHECK_RUN_FAILED: "report.stale_check.run_failed",
    });
  });

  it("has no two keys sharing a name", () => {
    const names = Object.values(ALERT_EVENTS);

    expect(new Set(names).size).toBe(names.length);
  });
});
