# Alerts from the API's own logs (api/docs/alerting.md §3), delivered to the
# security alerts topic in photo-privacy.tf.
#
# The API writes one JSON line per log call to CloudWatch Logs, in the log
# group Copilot creates for the service. Each rule below is a metric filter
# on that group, matching the line's `event` field (never the message), and
# an alarm on the filter's metric. Moderation is why this exists, so it is
# named for it, but every rule in alerting.md §3 lives here.
#
#   Severity    The alarm name says PAGE or TICKET (alerting.md §2), so the
#               subject of the email says how fast to act. Both go to the
#               same topic until a paging service exists.
#   Heartbeats  A job that stops firing logs nothing, so its alarm is on the
#               absence of `<job>.run_completed` for two intervals. Only jobs
#               switched on in that environment get one (var.api_jobs_enabled).
#   No user text  Descriptions are written here, never copied from a log line,
#               so the email carries the alarm name, what it means, and a link
#               to the matching log lines in the console.
#
# The log group belongs to Copilot's stack, not to Terraform. Until the service
# is deployed in an environment the group does not exist, and a metric filter
# on a missing group fails to create. So the rules are only planned once the
# group exists, and the check below says when they were skipped. Apply order in
# a new environment: `copilot svc deploy` first, then `terraform apply`.

locals {
  # "/copilot/everglow-staging-api" -> "everglow-staging-api"
  api_alarm_prefix     = replace(trimprefix(trimprefix(var.api_log_group_name, "/copilot/"), "/"), "/", "-")
  api_metric_namespace = "Everglow/${local.api_alarm_prefix}"
  api_log_group_exists = contains(tolist(data.aws_cloudwatch_log_groups.api.log_group_names), var.api_log_group_name)

  # The console page for the log group, filtered to a pattern. The console
  # escapes the part after "#" twice and writes "%" as "$"; urlencode writes
  # a space as "+", which the console reads literally, hence the swap.
  api_log_console = "https://${local.region}.console.aws.amazon.com/cloudwatch/home?region=${local.region}#logsV2:log-groups/log-group/${replace(urlencode(urlencode(var.api_log_group_name)), "%", "$")}/log-events$3FfilterPattern$3D"

  # Pino writes the level as a number.
  log_level_error = 50

  # Defaults for an "any occurrence" rule: one matching line in five minutes.
  api_alert_defaults = {
    period              = 300
    evaluation_periods  = 1
    comparison_operator = "GreaterThanOrEqualToThreshold"
    threshold           = 1
    treat_missing_data  = "notBreaching"
    enabled             = true
    link_pattern        = null
  }

  # One entry per rule in alerting.md §3. `event` is what the description
  # points at; `pattern` is what the filter matches.
  api_event_alerts = {
    # --- Moderation (docs/moderation.md §9) ---------------------------------

    # Where the urgency depends on the content, the line carries `severity`
    # (ALERT_SEVERITY) and the page rule routes on it. Child safety and
    # intimate images are what set it to page, so `reason` is matched too:
    # it keeps lines logged before `severity` existed paging, and lets the
    # ticket rule take exactly the rest.
    report_escalated_urgent = {
      severity = "page"
      event    = "report.escalated"
      summary  = "A child safety or intimate image report needs the platform now. Open the platform queue."
      pattern  = "{ ($.event = \"report.escalated\") && (($.severity = \"page\") || ($.reason = \"CHILD_SAFETY\") || ($.reason = \"NON_CONSENSUAL_INTIMATE_IMAGE\")) }"
    }
    report_escalated = {
      severity = "ticket"
      event    = "report.escalated"
      summary  = "A report moved to the platform queue or needs its attention."
      pattern  = "{ ($.event = \"report.escalated\") && ($.reason != \"CHILD_SAFETY\") && ($.reason != \"NON_CONSENSUAL_INTIMATE_IMAGE\") }"
    }
    # The 48-hour TAKE IT DOWN clock (logged by the hourly stale report check).
    report_removal_due_soon = {
      severity = "page"
      event    = "report.removal_due_soon"
      summary  = "An intimate image report is 36 hours old: 12 hours left to remove the image."
      pattern  = "{ $.event = \"report.removal_due_soon\" }"
    }
    report_removal_overdue = {
      severity = "page"
      event    = "report.removal_overdue"
      summary  = "An intimate image report has passed its 48-hour removal deadline."
      pattern  = "{ $.event = \"report.removal_overdue\" }"
    }
    # Covers the first 24-hour alert and the weekly re-alert of OPEN reports.
    report_stale = {
      severity = "ticket"
      event    = "report.stale"
      summary  = "Reports have waited in the platform queue past their deadline."
      pattern  = "{ $.event = \"report.stale\" }"
    }
    report_evidence_viewed_child_safety = {
      severity = "page"
      event    = "report.evidence.viewed"
      summary  = "Evidence of a child safety report was opened. Confirm it was a moderator on that report."
      pattern  = "{ ($.event = \"report.evidence.viewed\") && (($.severity = \"page\") || ($.reason = \"CHILD_SAFETY\")) }"
    }
    report_evidence_viewed = {
      severity = "ticket"
      event    = "report.evidence.viewed"
      summary  = "Evidence of a report was opened. Confirm it was a moderator on that report."
      pattern  = "{ ($.event = \"report.evidence.viewed\") && ($.reason != \"CHILD_SAFETY\") }"
    }
    report_evidence_copy_failed = {
      severity = "ticket"
      event    = "report.evidence.copy_failed"
      summary  = "A copy of reported content to evidence/ failed. The original was kept and the evidence job retries."
      pattern  = "{ $.event = \"report.evidence.copy_failed\" }"
    }
    report_hold_lapsed = {
      severity = "ticket"
      event    = "report.hold.lapsed"
      summary  = "A legal hold on a report passed. Extend it or let retention delete the evidence."
      pattern  = "{ $.event = \"report.hold.lapsed\" }"
    }

    # --- Account deletion and Sign in with Apple ----------------------------

    user_account_deletion_abandoned = {
      severity = "page"
      event    = "user.account.deletion_abandoned"
      summary  = "An account deletion used up its attempts. The person is locked out and their data is still stored."
      pattern  = "{ $.event = \"user.account.deletion_abandoned\" }"
    }
    # Nobody can delete their account. Auth0's check comes first in
    # `blockers`, so a lone probe failure (Auth0 unreachable for a moment) is
    # `auth0_probe_failed` with no Apple blocker after it, and only a ticket.
    user_account_deletion_unavailable = {
      severity = "page"
      event    = "user.account.deletion_unavailable"
      summary  = "Account deletions are refused before they start: Auth0 or Apple is misconfigured."
      pattern  = "{ ($.event = \"user.account.deletion_unavailable\") && (($.blockers[0] != \"auth0_probe_failed\") || ($.blockers[1] = \"apple_unconfigured\") || ($.blockers[1] = \"apple_key_unusable\")) }"
    }
    user_account_deletion_unavailable_probe = {
      severity = "ticket"
      event    = "user.account.deletion_unavailable"
      summary  = "An account deletion was refused because Auth0 could not be reached for the preflight check."
      pattern  = "{ ($.event = \"user.account.deletion_unavailable\") && ($.blockers[0] = \"auth0_probe_failed\") }"
    }
    # Nothing else deletes the dropped objects where the orphan reconciler is off.
    user_account_deletion_outbox_given_up = {
      severity = var.api_jobs_enabled.photo_orphan_reconciler ? "ticket" : "page"
      event    = "user.account.deletion_outbox.given_up"
      summary  = "S3 refused a deleted account's objects too many times; they were dropped from the outbox and are still stored."
      pattern  = "{ $.event = \"user.account.deletion_outbox.given_up\" }"
    }
    user_account_deletion_stuck = {
      severity = "ticket"
      event    = "user.account.deletion_stuck"
      summary  = "An account deletion is still pending past its stuck threshold."
      pattern  = "{ $.event = \"user.account.deletion_stuck\" }"
    }
    user_account_apple_revocation_skipped = {
      severity = "page"
      event    = "user.account.apple_revocation_skipped"
      summary  = "An Apple account was deleted without revoking its Sign in with Apple token (misconfiguration)."
      pattern  = "{ ($.event = \"user.account.apple_revocation_skipped\") && ($.level = ${local.log_level_error}) }"
    }
    user_account_apple_revocation_failed = {
      severity = "page"
      event    = "user.account.apple_revocation_failed"
      summary  = "Apple refused a token revocation. Check the APPLE_SIWA_* values."
      pattern  = "{ $.event = \"user.account.apple_revocation_failed\" }"
    }

    # --- Photos and storage --------------------------------------------------

    # Nothing retries a failed purge where the orphan reconciler is off.
    photos_purge_failed = {
      severity = var.api_jobs_enabled.photo_orphan_reconciler ? "ticket" : "page"
      event    = "user.account.photos_purged"
      summary  = "Photo rows were deleted but some of their S3 objects were not. They are billed orphans until the orphan reconciler takes them."
      pattern  = "{ (($.event = \"user.account.photos_purged\") || ($.event = \"event.photos.purged\") || ($.event = \"event.member.photos_purged\") || ($.event = \"event.gallery.photos_purged\")) && ($.level = ${local.log_level_error}) }"
    }
    # alerting.md asks for the same eventId three runs running; a metric
    # cannot tell galleries apart, so this is three hourly runs with a failure.
    event_gallery_close_failed = {
      severity           = "ticket"
      event              = "event.gallery_close.failed"
      summary            = "Closing a gallery failed on three hourly runs in a row. Its photos stay past the window."
      pattern            = "{ $.event = \"event.gallery_close.failed\" }"
      period             = 3600
      evaluation_periods = 3
    }
    photo_storage_reservation_conflicts = {
      severity  = "ticket"
      event     = "photo.storage.reservation_conflict"
      summary   = "More than 20 upload reservation conflicts in 10 minutes."
      pattern   = "{ $.event = \"photo.storage.reservation_conflict\" }"
      period    = 600
      threshold = 21
    }
    photo_storage_reservation_conflicts_refused = {
      severity  = "ticket"
      event     = "photo.storage.reservation_conflict"
      summary   = "Five or more upload reservations were refused with a 409 in 10 minutes."
      pattern   = "{ ($.event = \"photo.storage.reservation_conflict\") && ($.willRetry IS FALSE) }"
      period    = 600
      threshold = 5
    }
    photo_upload_presign_failed = {
      severity  = "page"
      event     = "photo.upload_slots.presign_failed"
      summary   = "S3 could not presign uploads three or more times in 5 minutes. Nobody can upload."
      pattern   = "{ $.event = \"photo.upload_slots.presign_failed\" }"
      threshold = 3
    }
    photo_upload_slot_release_failed = {
      severity  = "ticket"
      event     = "photo.upload_slots.presign_failed"
      summary   = "Releasing upload slots failed three or more times in an hour. Their quota waits for the hourly cleanup."
      pattern   = "{ (($.event = \"photo.upload_slots.presign_failed\") || ($.event = \"photo.upload_slots.rejected\")) && ($.level = ${local.log_level_error}) }"
      period    = 3600
      threshold = 3
    }
    photo_pending_cleanup_item_failures = {
      severity           = "ticket"
      event              = "photo.pending_cleanup.run_completed"
      summary            = "The pending photo cleanup could not release some slots on three runs in a row."
      pattern            = "{ ($.event = \"photo.pending_cleanup.run_completed\") && (($.failed > 0) || ($.expired.failed > 0)) }"
      period             = 3600
      evaluation_periods = 3
      enabled            = var.api_jobs_enabled.photo_pending_cleanup
    }
    storage_orphan_reconcile_incomplete = {
      severity           = "ticket"
      event              = "storage.orphan_reconcile.run_completed"
      summary            = "The orphan reconciler left work undone on three daily runs in a row."
      pattern            = "{ ($.event = \"storage.orphan_reconcile.run_completed\") && (($.failed > 0) || ($.completed IS FALSE)) }"
      period             = 86400
      evaluation_periods = 3
      enabled            = var.api_jobs_enabled.photo_orphan_reconciler
    }

    # --- Requests --------------------------------------------------------------

    request_unhandled_errors = {
      severity  = "page"
      event     = "request.unhandled_error"
      summary   = "Five or more 5xx responses in 5 minutes."
      pattern   = "{ $.event = \"request.unhandled_error\" }"
      threshold = 5
    }
    request_unhandled_error = {
      severity = "ticket"
      event    = "request.unhandled_error"
      summary  = "A request answered 5xx."
      pattern  = "{ $.event = \"request.unhandled_error\" }"
    }
    rate_limit_exceeded = {
      severity  = "ticket"
      event     = "rate_limit.exceeded"
      summary   = "More than 20 rate limit rejections in 10 minutes."
      pattern   = "{ $.event = \"rate_limit.exceeded\" }"
      period    = 600
      threshold = 21
    }
    # alerting.md asks for distinct users; a metric counts lines.
    rate_limit_exceeded_sensitive = {
      severity  = "ticket"
      event     = "rate_limit.exceeded"
      summary   = "Three or more rejections on the sensitive rate limit tier in 10 minutes."
      pattern   = "{ ($.event = \"rate_limit.exceeded\") && ($.tier = \"sensitive\") }"
      period    = 600
      threshold = 3
    }
  }

  # Every scheduled job (alerting.md, "Scheduler heartbeats"). `enabled` is
  # whether the environment runs it, mirroring the flags in the Copilot manifest.
  api_jobs = {
    user_account_deletion_reconcile = {
      event_prefix   = "user.account.deletion_reconcile"
      name           = "account deletion reconciler"
      interval       = 3600
      severity       = "page"
      enabled        = var.api_jobs_enabled.account_deletion_reconciler
      disabled_event = "user.account.deletion_reconciler.disabled"
    }
    photo_pending_cleanup = {
      event_prefix   = "photo.pending_cleanup"
      name           = "pending photo cleanup"
      interval       = 3600
      severity       = "ticket"
      enabled        = var.api_jobs_enabled.photo_pending_cleanup
      disabled_event = null
    }
    storage_orphan_reconcile = {
      event_prefix   = "storage.orphan_reconcile"
      name           = "orphaned S3 object reconciler"
      interval       = 86400
      severity       = "ticket"
      enabled        = var.api_jobs_enabled.photo_orphan_reconciler
      disabled_event = null
    }
    # Runs the 24-hour and 48-hour moderation deadlines, so it pages.
    report_stale_check = {
      event_prefix   = "report.stale_check"
      name           = "stale report check"
      interval       = 3600
      severity       = "page"
      enabled        = true
      disabled_event = null
    }
    event_gallery_close = {
      event_prefix   = "event.gallery_close"
      name           = "gallery close job"
      interval       = 3600
      severity       = "ticket"
      enabled        = var.api_jobs_enabled.gallery_close
      disabled_event = "event.gallery_close.disabled"
    }
    report_evidence_job = {
      event_prefix   = "report.evidence_job"
      name           = "evidence job"
      interval       = 86400
      severity       = "ticket"
      enabled        = var.api_jobs_enabled.moderation_evidence_job
      disabled_event = "report.evidence_job.disabled"
    }
    photo_hash_backfill = {
      event_prefix   = "photo.hash_backfill"
      name           = "photo hash backfill"
      interval       = 3600
      severity       = "ticket"
      enabled        = var.api_jobs_enabled.photo_hash_backfill
      disabled_event = "photo.hash_backfill.disabled"
    }
  }

  # Two failed runs in a row, for every job: a disabled job logs nothing.
  api_job_failure_alerts = {
    for key, job in local.api_jobs : "${key}_run_failed" => {
      severity           = job.severity
      event              = "${job.event_prefix}.run_failed"
      summary            = "The ${job.name} threw on two runs in a row."
      pattern            = "{ $.event = \"${job.event_prefix}.run_failed\" }"
      period             = job.interval
      evaluation_periods = 2
    }
  }

  # No run_completed for two intervals (2 h hourly, 48 h daily), where the job is on.
  api_job_heartbeat_alerts = {
    for key, job in local.api_jobs : "${key}_heartbeat" => {
      severity            = job.severity
      event               = "${job.event_prefix}.run_completed"
      summary             = "The ${job.name} has not completed a run for two intervals. Check the service is up and the job's flag is set."
      pattern             = "{ $.event = \"${job.event_prefix}.run_completed\" }"
      period              = job.interval
      evaluation_periods  = 2
      comparison_operator = "LessThanThreshold"
      treat_missing_data  = "breaching"
      enabled             = job.enabled
    }
  }

  # The job is meant to run here, but the API booted with it switched off.
  api_job_disabled_alerts = {
    for key, job in local.api_jobs : "${key}_disabled" => {
      severity = job.severity
      event    = job.disabled_event
      summary  = "The ${job.name} is switched off in an environment that should run it. Set its flag and redeploy."
      pattern  = "{ $.event = \"${job.disabled_event}\" }"
      enabled  = job.enabled
    } if job.disabled_event != null
  }

  api_alarm_definitions = {
    for key, alert in merge(
      local.api_event_alerts,
      local.api_job_failure_alerts,
      local.api_job_heartbeat_alerts,
      local.api_job_disabled_alerts,
    ) : key => merge(local.api_alert_defaults, alert)
  }

  api_alarms = {
    for key, alert in local.api_alarm_definitions : key => merge(alert, {
      name = "${local.api_alarm_prefix}-${alert.severity}-${replace(key, "_", "-")}"
      description = join(" ", [
        "[${upper(alert.severity)}]",
        alert.summary,
        "What to do: api/docs/alerting.md, ${alert.event}.",
        "Log lines: ${local.api_log_console}${replace(urlencode(replace(urlencode(coalesce(alert.link_pattern, alert.pattern)), "+", "%20")), "%", "$")}",
      ])
    }) if alert.enabled && local.api_log_group_exists
  }
}

# Lists groups by prefix, so it returns nothing rather than failing when the
# service has not been deployed yet.
data "aws_cloudwatch_log_groups" "api" {
  log_group_name_prefix = var.api_log_group_name
}

check "api_log_group_exists" {
  assert {
    condition     = local.api_log_group_exists
    error_message = "Log group ${var.api_log_group_name} does not exist, so no API log alerts were planned. Deploy the service with Copilot, then apply again."
  }
}

resource "aws_cloudwatch_log_metric_filter" "api" {
  for_each = local.api_alarms

  name           = each.value.name
  log_group_name = var.api_log_group_name
  pattern        = each.value.pattern

  metric_transformation {
    namespace = local.api_metric_namespace
    name      = each.key
    value     = "1"
    unit      = "Count"
  }
}

# CloudWatch publishes as cloudwatch.amazonaws.com; the topic policy in
# photo-privacy.tf allows exactly these alarms' ARNs.
resource "aws_cloudwatch_metric_alarm" "api" {
  for_each = local.api_alarms

  alarm_name          = each.value.name
  alarm_description   = each.value.description
  namespace           = local.api_metric_namespace
  metric_name         = aws_cloudwatch_log_metric_filter.api[each.key].metric_transformation[0].name
  statistic           = "Sum"
  period              = each.value.period
  evaluation_periods  = each.value.evaluation_periods
  datapoints_to_alarm = each.value.evaluation_periods
  comparison_operator = each.value.comparison_operator
  threshold           = each.value.threshold
  treat_missing_data  = each.value.treat_missing_data
  alarm_actions       = [aws_sns_topic.security_alerts.arn]

  tags = {
    Severity = each.value.severity
  }

  lifecycle {
    precondition {
      condition     = length(each.value.description) <= 1024
      error_message = "The description of ${each.value.name} is over CloudWatch's 1024 characters; shorten its summary or set link_pattern."
    }
  }
}
