variable "environment" {
  description = "Short environment name (dev, staging). Every resource name ends in it, and the bucket is everglow-photos-<environment>."
  type        = string
}

# The API's identity. Only it and the image processor may read photos (the
# bucket policy) and use the photos key (the key policy). Name it with an IAM
# user (dev, whose key is in api/.env), a role (the Copilot service's task
# role), or both.
variable "api_users" {
  description = "IAM users the API runs as. The bucket policy matches each by unique_id, so a deleted and recreated user with the same name is not trusted."
  type = list(object({
    arn       = string
    unique_id = string
  }))
  default = []
}

variable "api_roles" {
  description = "IAM roles the API runs as, such as the Copilot service's task role. Every session of the role counts as the API: ECS names each session after its task, so it can't be pinned to one name. Matched by unique_id like api_users, so a replaced role is not trusted until the next apply."
  type = list(object({
    arn       = string
    name      = string
    unique_id = string
  }))
  default = []

  validation {
    condition     = length(var.api_users) + length(var.api_roles) > 0
    error_message = "Give the API at least one identity, in api_users or api_roles."
  }
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

variable "expire_objects_after_days" {
  description = "Delete every object this many days after it was written, as a backstop for test data. Test environments only: the database keeps its photo rows, so an expired photo shows as missing. Null keeps objects until the API deletes them."
  type        = number
  default     = null
}

variable "alert_topic_arn" {
  description = "SNS topic the dead-letter queue alarm publishes to. The topic's policy must allow this module's alarm and read alert rule (outputs dlq_alarm_arn and read_alert_rule_arn)."
  type        = string
}
