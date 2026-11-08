import { ALERT_EVENTS, ALERT_SEVERITY, PAGING_ESCALATION_REASONS } from "./alert-events.constants";

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
      ACCOUNT_DELETION_UNAVAILABLE: "user.account.deletion_unavailable",
      ACCOUNT_DELETION_RECONCILER_DISABLED: "user.account.deletion_reconciler.disabled",
      APPLE_REVOCATION_SKIPPED: "user.account.apple_revocation_skipped",
      APPLE_REVOCATION_FAILED: "user.account.apple_revocation_failed",

      ACCOUNT_PHOTOS_PURGED: "user.account.photos_purged",
      ACCOUNT_DELETION_OUTBOX_GIVEN_UP: "user.account.deletion_outbox.given_up",
      EVENT_PHOTOS_PURGED: "event.photos.purged",
      EVENT_MEMBER_PHOTOS_PURGED: "event.member.photos_purged",
      GALLERY_PHOTOS_PURGED: "event.gallery.photos_purged",
      GALLERY_CLOSE_FAILED: "event.gallery_close.failed",
      GALLERY_CLOSE_DISABLED: "event.gallery_close.disabled",
      STORAGE_RESERVATION_CONFLICT: "photo.storage.reservation_conflict",
      UPLOAD_SLOTS_PRESIGN_FAILED: "photo.upload_slots.presign_failed",
      UPLOAD_SLOTS_REJECTED: "photo.upload_slots.rejected",
      PHOTO_HASH_BACKFILL_DISABLED: "photo.hash_backfill.disabled",

      NOTIFICATION_GIVEN_UP: "notification.given_up",
      NOTIFICATION_SENDER_DISABLED: "notification.sender.disabled",
      NOTIFICATION_CREDENTIALS_INVALID: "notification.credentials_invalid",

      REPORT_ESCALATED: "report.escalated",
      REPORT_STALE: "report.stale",
      REPORT_REMOVAL_DUE_SOON: "report.removal_due_soon",
      REPORT_REMOVAL_OVERDUE: "report.removal_overdue",
      REPORT_EVIDENCE_COPY_FAILED: "report.evidence.copy_failed",
      REPORT_EVIDENCE_VIEWED: "report.evidence.viewed",
      REPORT_HOLD_LAPSED: "report.hold.lapsed",
      REPORT_EVIDENCE_JOB_DISABLED: "report.evidence_job.disabled",

      ACCOUNT_DELETION_RECONCILE_RUN_COMPLETED: "user.account.deletion_reconcile.run_completed",
      ACCOUNT_DELETION_RECONCILE_RUN_FAILED: "user.account.deletion_reconcile.run_failed",
      PHOTO_PENDING_CLEANUP_RUN_COMPLETED: "photo.pending_cleanup.run_completed",
      PHOTO_PENDING_CLEANUP_RUN_FAILED: "photo.pending_cleanup.run_failed",
      S3_ORPHAN_RECONCILE_RUN_COMPLETED: "storage.orphan_reconcile.run_completed",
      S3_ORPHAN_RECONCILE_RUN_FAILED: "storage.orphan_reconcile.run_failed",
      STALE_REPORT_CHECK_RUN_COMPLETED: "report.stale_check.run_completed",
      STALE_REPORT_CHECK_RUN_FAILED: "report.stale_check.run_failed",
      GALLERY_CLOSE_RUN_COMPLETED: "event.gallery_close.run_completed",
      GALLERY_CLOSE_RUN_FAILED: "event.gallery_close.run_failed",
      GALLERY_CLOSING_REMINDER_RUN_COMPLETED: "event.gallery_closing_reminder.run_completed",
      GALLERY_CLOSING_REMINDER_RUN_FAILED: "event.gallery_closing_reminder.run_failed",
      REPORT_EVIDENCE_RUN_COMPLETED: "report.evidence_job.run_completed",
      REPORT_EVIDENCE_RUN_FAILED: "report.evidence_job.run_failed",
      PHOTO_HASH_BACKFILL_RUN_COMPLETED: "photo.hash_backfill.run_completed",
      PHOTO_HASH_BACKFILL_RUN_FAILED: "photo.hash_backfill.run_failed",
      NOTIFICATION_SEND_RUN_COMPLETED: "notification.send.run_completed",
      NOTIFICATION_SEND_RUN_FAILED: "notification.send.run_failed",
      NOTIFICATION_RECEIPTS_RUN_COMPLETED: "notification.receipts.run_completed",
      NOTIFICATION_RECEIPTS_RUN_FAILED: "notification.receipts.run_failed",
      NOTIFICATION_RETENTION_RUN_COMPLETED: "notification.retention.run_completed",
      NOTIFICATION_RETENTION_RUN_FAILED: "notification.retention.run_failed",
    });
  });

  it("has no two keys sharing a name", () => {
    const names = Object.values(ALERT_EVENTS);

    expect(new Set(names).size).toBe(names.length);
  });

  // The values alert rules route on: `severity = page` pages, and a
  // report.escalated line with one of these reasons is a page.
  it("pins the severities and the escalation reasons that page", () => {
    expect(ALERT_SEVERITY).toEqual({ PAGE: "page", TICKET: "ticket" });
    expect(PAGING_ESCALATION_REASONS).toEqual(["child_safety", "intimate_image"]);
  });
});
