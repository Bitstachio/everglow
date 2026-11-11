variable "alert_emails" {
  description = "Addresses security alerts are emailed to. Set them in terraform.tfvars (gitignored); this repository is public."
  type        = set(string)
}

variable "allow_human_photo_reads" {
  description = "Lifts the bucket policy's block on reading photos, for debugging dev only. Photos encrypted with the KMS key stay unreadable to people even then, since only the API may decrypt them. Flipping it is itself alerted."
  type        = bool
  default     = false
}

variable "api_log_group_name" {
  description = "CloudWatch log group Copilot creates for the API service (/copilot/<app>-<env>-<svc>). Saved queries and the dashboard (api-logs.tf) and the metric-filter alarms (moderation-alerts.tf) read it. Terraform does not create the group; deploy the service first. Alarms are planned only once the group exists."
  type        = string
  default     = "/copilot/everglow-staging-api"
}

# Keep in step with the *_ENABLED variables for that environment in
# api/copilot/api/manifest.yml: a heartbeat alarm on a job that is off fires
# for ever, and a job that is on without one can stop unnoticed.
variable "api_jobs_enabled" {
  description = "Which of the API's optional scheduled jobs run in the environment whose logs are alerted on. Each one that is on gets a heartbeat alarm and an alarm if the API boots with it off. The stale report check always runs and is always watched."
  type = object({
    account_deletion_reconciler = optional(bool, false) # ACCOUNT_DELETION_RECONCILER_ENABLED
    photo_pending_cleanup       = optional(bool, true)  # PHOTO_PENDING_CLEANUP_ENABLED (on unless "false")
    photo_orphan_reconciler     = optional(bool, false) # PHOTO_ORPHAN_RECONCILER_ENABLED
    gallery_close               = optional(bool, false) # GALLERY_CLOSE_ENABLED
    moderation_evidence_job     = optional(bool, false) # MODERATION_EVIDENCE_JOB_ENABLED
    photo_hash_backfill         = optional(bool, false) # PHOTO_HASH_BACKFILL_ENABLED
    notification_sender         = optional(bool, true)  # NOTIFICATIONS_SENDER_ENABLED (on unless "false")
    upload_screening            = optional(bool, false) # MODERATION_SCREENING_ENABLED
  })
  default = {}
}
