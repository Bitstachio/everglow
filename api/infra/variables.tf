variable "alert_email" {
  description = "Where security alerts are emailed. Set it in terraform.tfvars (gitignored); this repository is public."
  type        = string
}

variable "allow_human_photo_reads" {
  description = "Lifts the bucket policy's block on reading photos, for debugging dev only. Flipping it is itself alerted."
  type        = bool
  default     = false
}
