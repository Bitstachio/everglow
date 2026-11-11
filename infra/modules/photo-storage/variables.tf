variable "environment" {
  description = "Short environment name (dev, staging). Every resource name ends in it, and the bucket is everglow-photos-<environment>."
  type        = string
}

# The API's identity. Only it and the image processor may read photos (the
# bucket policy) and use the photos key (the key policy).
variable "api_users" {
  description = "IAM users the API runs as. The bucket policy matches each by unique_id, so a deleted and recreated user with the same name is not trusted."
  type = list(object({
    arn       = string
    unique_id = string
  }))
}

variable "allow_human_photo_reads" {
  description = "Lifts the bucket policy's block on reading photos, for debugging only. Photos encrypted with the KMS key stay unreadable to people even then. Flipping it is itself alerted."
  type        = bool
  default     = false
}

variable "image_processor_zip" {
  description = "Path to the image processor's built zip (functions/image-processor/dist/function.zip)."
  type        = string
}

variable "alert_topic_arn" {
  description = "SNS topic the dead-letter queue alarm publishes to. The topic's policy must allow this module's alarm and read alert rule (outputs dlq_alarm_arn and read_alert_rule_arn)."
  type        = string
}
