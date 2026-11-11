# Where resources used to live in the state, so Terraform moves them instead
# of destroying and recreating them. Keep these: a state that has not been
# applied since a move still needs its block. Each one only renames the
# address; a plan shows "has moved to" and no change in AWS.

# The policy used to hold only the TLS rule under this name.
moved {
  from = aws_s3_bucket_policy.photos_tls_only
  to   = aws_s3_bucket_policy.photos
}

# --- Dev's photo stack moved into modules/photo-storage (photos.tf) -----------

moved {
  from = aws_s3_bucket.photos
  to   = module.photos_dev.aws_s3_bucket.photos
}

moved {
  from = aws_s3_bucket_public_access_block.photos
  to   = module.photos_dev.aws_s3_bucket_public_access_block.photos
}

moved {
  from = aws_s3_bucket_policy.photos
  to   = module.photos_dev.aws_s3_bucket_policy.photos
}

moved {
  from = aws_s3_bucket_server_side_encryption_configuration.photos
  to   = module.photos_dev.aws_s3_bucket_server_side_encryption_configuration.photos
}

moved {
  from = aws_s3_bucket_cors_configuration.photos
  to   = module.photos_dev.aws_s3_bucket_cors_configuration.photos
}

moved {
  from = aws_s3_bucket_lifecycle_configuration.photos
  to   = module.photos_dev.aws_s3_bucket_lifecycle_configuration.photos
}

moved {
  from = aws_kms_key.photos
  to   = module.photos_dev.aws_kms_key.photos
}

moved {
  from = aws_kms_alias.photos
  to   = module.photos_dev.aws_kms_alias.photos
}

moved {
  from = aws_sqs_queue.photo_uploads_dlq
  to   = module.photos_dev.aws_sqs_queue.photo_uploads_dlq
}

moved {
  from = aws_sqs_queue.photo_uploads
  to   = module.photos_dev.aws_sqs_queue.photo_uploads
}

moved {
  from = aws_cloudwatch_metric_alarm.photo_uploads_dlq
  to   = module.photos_dev.aws_cloudwatch_metric_alarm.photo_uploads_dlq
}

moved {
  from = aws_sqs_queue_policy.photo_uploads_dlq
  to   = module.photos_dev.aws_sqs_queue_policy.photo_uploads_dlq
}

moved {
  from = aws_sqs_queue_policy.photo_uploads
  to   = module.photos_dev.aws_sqs_queue_policy.photo_uploads
}

moved {
  from = aws_cloudwatch_log_group.image_processor
  to   = module.photos_dev.aws_cloudwatch_log_group.image_processor
}

moved {
  from = aws_iam_role.image_processor
  to   = module.photos_dev.aws_iam_role.image_processor
}

moved {
  from = aws_iam_role_policy.image_processor
  to   = module.photos_dev.aws_iam_role_policy.image_processor
}

moved {
  from = aws_lambda_function.image_processor
  to   = module.photos_dev.aws_lambda_function.image_processor
}

moved {
  from = aws_lambda_event_source_mapping.photo_uploads
  to   = module.photos_dev.aws_lambda_event_source_mapping.photo_uploads
}

moved {
  from = aws_s3_bucket_notification.photo_uploads
  to   = module.photos_dev.aws_s3_bucket_notification.photo_uploads
}

moved {
  from = aws_cloudwatch_event_rule.photo_read_by_person
  to   = module.photos_dev.aws_cloudwatch_event_rule.photo_read_by_person
}

moved {
  from = aws_cloudwatch_event_target.photo_read_by_person
  to   = module.photos_dev.aws_cloudwatch_event_target.photo_read_by_person
}
