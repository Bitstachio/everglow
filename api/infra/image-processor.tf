# Photo uploads → SQS → image-processor Lambda.
#
# S3 notifies the queue on ObjectCreated and ObjectRemoved under photos/. The function reads the
# original, writes thumb.webp + large.jpg under derived/, and must be on the
# photos KMS key and the bucket's read allowlist (see main.tf / photo-privacy.tf).
#
# Before plan/apply, build the zip this file deploys:
#   cd functions/image-processor && pnpm build

locals {
  image_processor_zip = "${path.module}/../../functions/image-processor/dist/function.zip"
}

# --- Queue: S3 notifications, with an alarmed DLQ for repeated failures -------

resource "aws_sqs_queue" "photo_uploads_dlq" {
  name                      = "everglow-photo-uploads-dlq-dev"
  message_retention_seconds = 1209600 # 14 days, so a failed upload can be inspected
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "photo_uploads" {
  name                       = "everglow-photo-uploads-dev"
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = 360 # 6× the function timeout; shorter and SQS redelivers mid-run

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.photo_uploads_dlq.arn
    maxReceiveCount     = 5
  })
}

# Anything in the DLQ is a photo that failed 5 times with an error that looked
# temporary. Undecodable photos (HEIC until EV-5, corrupt, too large) are
# acknowledged and logged as photo.derivatives.undecodable instead, so they do
# not land here. The photo.derivatives.failed log names the bucket and key.
#
# CloudWatch publishes as cloudwatch.amazonaws.com, so the topic policy in
# photo-privacy.tf has to allow that principal for this alarm's ARN.
resource "aws_cloudwatch_metric_alarm" "photo_uploads_dlq" {
  alarm_name          = "everglow-photo-uploads-dlq-dev"
  alarm_description   = "Photo derivative messages are in ${aws_sqs_queue.photo_uploads_dlq.name} after 5 failed attempts. Search the image processor's logs for photo.derivatives.failed."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.photo_uploads_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.security_alerts.arn]
}

resource "aws_sqs_queue_policy" "photo_uploads_dlq" {
  queue_url = aws_sqs_queue.photo_uploads_dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.photo_uploads_dlq.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        # Same-account redrive is not implicit when the policy is set by API.
        Sid       = "AllowSourceQueueRedrive"
        Effect    = "Allow"
        Principal = { Service = "sqs.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.photo_uploads_dlq.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_sqs_queue.photo_uploads.arn } }
      },
    ]
  })
}

resource "aws_sqs_queue_policy" "photo_uploads" {
  queue_url = aws_sqs_queue.photo_uploads.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.photo_uploads.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "AllowPhotosBucket"
        Effect    = "Allow"
        Principal = { Service = "s3.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.photo_uploads.arn
        Condition = {
          ArnEquals    = { "aws:SourceArn" = aws_s3_bucket.photos.arn }
          StringEquals = { "aws:SourceAccount" = local.account_id }
        }
      },
    ]
  })
}

# --- Lambda: consumes the queue ------------------------------------------------

resource "aws_cloudwatch_log_group" "image_processor" {
  name              = "/aws/lambda/everglow-image-processor-dev"
  retention_in_days = 14
}

resource "aws_iam_role" "image_processor" {
  name = "everglow-image-processor-dev"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy" "image_processor" {
  name = "everglow-image-processor-dev"
  role = aws_iam_role.image_processor.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility",
        ]
        Resource = aws_sqs_queue.photo_uploads.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.photos.arn}/photos/*"
      },
      {
        # Required to distinguish a missing original (404) from denied access.
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.photos.arn
      },
      {
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.photos.arn}/derived/*",
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey",
        ]
        Resource = aws_kms_key.photos.arn
      },
      {
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          aws_cloudwatch_log_group.image_processor.arn,
          "${aws_cloudwatch_log_group.image_processor.arn}:*",
        ]
      },
    ]
  })
}

resource "aws_lambda_function" "image_processor" {
  function_name = "everglow-image-processor-dev"
  role          = aws_iam_role.image_processor.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"
  timeout       = 60
  memory_size   = 1536

  # The build is reproducible, so this only changes when the code or lockfile does.
  filename         = local.image_processor_zip
  source_code_hash = filebase64sha256(local.image_processor_zip)

  # A deployed build: info-level logs tagged env "production", like the API
  # under compose (functions/image-processor/src/logging.ts). Set LOG_LEVEL to
  # debug to see ignored notifications.
  environment {
    variables = {
      NODE_ENV  = "production"
      LOG_LEVEL = "info"
    }
  }

  depends_on = [
    aws_iam_role_policy.image_processor,
    aws_cloudwatch_log_group.image_processor,
  ]

  lifecycle {
    precondition {
      condition     = fileexists(local.image_processor_zip)
      error_message = "Missing functions/image-processor/dist/function.zip. Run: cd functions/image-processor && pnpm build"
    }
  }
}

resource "aws_lambda_event_source_mapping" "photo_uploads" {
  event_source_arn        = aws_sqs_queue.photo_uploads.arn
  function_name           = aws_lambda_function.image_processor.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]
}

# This resource owns every notification on the photos bucket. A later
# notification has to be added here, or apply will delete it.
resource "aws_s3_bucket_notification" "photo_uploads" {
  bucket = aws_s3_bucket.photos.id

  queue {
    queue_arn     = aws_sqs_queue.photo_uploads.arn
    events        = ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"]
    filter_prefix = "photos/"
  }

  depends_on = [aws_sqs_queue_policy.photo_uploads]
}
