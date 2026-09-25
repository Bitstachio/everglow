variable "alert_emails" {
  description = "Addresses security alerts are emailed to. Set them in terraform.tfvars (gitignored); this repository is public."
  type        = set(string)
}

variable "allow_human_photo_reads" {
  description = "Lifts the bucket policy's block on reading photos, for debugging dev only. Photos encrypted with the KMS key stay unreadable to people even then, since only the API may decrypt them. Flipping it is itself alerted."
  type        = bool
  default     = false
}
