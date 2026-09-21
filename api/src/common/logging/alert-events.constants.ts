/**
 * Event names that alert rules key off. See docs/alerting.md.
 *
 * These strings are a contract with whatever log platform evaluates the
 * rules: renaming one silently disables its alert. Code that emits one of
 * these events references the constant, and alert-events.constants.spec.ts
 * pins the values. Events nobody alerts on stay plain string literals.
 */
export const ALERT_EVENTS = {
  REQUEST_UNHANDLED_ERROR: "request.unhandled_error",

  ACCOUNT_DELETION_ABANDONED: "user.account.deletion_abandoned",
  ACCOUNT_DELETION_STUCK: "user.account.deletion_stuck",
  ACCOUNT_DELETION_RECONCILER_DISABLED: "user.account.deletion_reconciler.disabled",
  APPLE_REVOCATION_SKIPPED: "user.account.apple_revocation_skipped",
  APPLE_REVOCATION_FAILED: "user.account.apple_revocation_failed",

  ACCOUNT_PHOTOS_PURGED: "user.account.photos_purged",
  EVENT_PHOTOS_PURGED: "event.photos.purged",
  STORAGE_RESERVATION_CONFLICT: "photo.storage.reservation_conflict",
  UPLOAD_SLOTS_PRESIGN_FAILED: "photo.upload_slots.presign_failed",
  UPLOAD_SLOTS_REJECTED: "photo.upload_slots.rejected",

  // Scheduler heartbeats and failures, emitted by runScheduledJob.
  ACCOUNT_DELETION_RECONCILE_RUN_COMPLETED: "user.account.deletion_reconcile.run_completed",
  ACCOUNT_DELETION_RECONCILE_RUN_FAILED: "user.account.deletion_reconcile.run_failed",
  PHOTO_PENDING_CLEANUP_RUN_COMPLETED: "photo.pending_cleanup.run_completed",
  PHOTO_PENDING_CLEANUP_RUN_FAILED: "photo.pending_cleanup.run_failed",
  PHOTO_ORPHAN_RECONCILE_RUN_COMPLETED: "photo.orphan_reconcile.run_completed",
  PHOTO_ORPHAN_RECONCILE_RUN_FAILED: "photo.orphan_reconcile.run_failed",
} as const;

export type AlertEvent = (typeof ALERT_EVENTS)[keyof typeof ALERT_EVENTS];
