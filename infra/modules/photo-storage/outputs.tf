output "bucket_name" {
  description = "The photos bucket: the API's AWS_S3_BUCKET in this environment."
  value       = aws_s3_bucket.photos.id
}

output "bucket_arn" {
  description = "ARN of the photos bucket, for the API's S3 permissions."
  value       = aws_s3_bucket.photos.arn
}

output "image_processor_function_name" {
  description = "The image processor function. Changes to it are alerted (photo-privacy.tf)."
  value       = aws_lambda_function.image_processor.function_name
}

output "image_processor_role_name" {
  description = "The image processor's role. Changes to its trust or permissions are alerted (photo-privacy.tf)."
  value       = aws_iam_role.image_processor.name
}

output "read_alert_rule_arn" {
  description = "The rule that reports reads by people. The alert topic's policy must allow it."
  value       = aws_cloudwatch_event_rule.photo_read_by_person.arn
}

output "dlq_alarm_arn" {
  description = "The dead-letter queue alarm. The alert topic's policy must allow it."
  value       = aws_cloudwatch_metric_alarm.photo_uploads_dlq.arn
}
