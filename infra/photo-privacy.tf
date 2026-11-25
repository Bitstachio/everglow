# Keeping users' photos private from people with AWS access (docs/photo-privacy.md).
#
# The controls on each photos bucket are in modules/photo-storage, one
# instance per environment (photos.tf):
#
#   Bucket policy  only the API and image processor may read photos
#   KMS key        only the API and image processor can encrypt and decrypt them
#   EventBridge    emails an alert when anyone else reads, or tries to read, one
#
# This file holds what they share:
#
#   CloudTrail   records every read and write of a photo, and every change to
#                the rules, in a separate log bucket
#   SNS          the topic every alert is emailed through
#   EventBridge  emails an alert when a bucket policy, a key, the trail, an
#                image processor's code or configuration, or its role's trust
#                or permissions change

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = "us-east-1" # the provider's region
  trail_name = "everglow-photos-dev-access"
  trail_arn  = "arn:aws:cloudtrail:${local.region}:${local.account_id}:trail/${local.trail_name}"

  # Every photo-storage instance (photos.tf). The trail, the topic and the
  # control-change alert below cover each one listed here.
  photo_storage = [module.photos_dev, module.photos_staging]

  alert_rules = concat(
    [for photos in local.photo_storage : photos.read_alert_rule_arn],
    [aws_cloudwatch_event_rule.privacy_controls_changed.arn],
  )
  cloudwatch_alarms = concat(
    [for photos in local.photo_storage : photos.dlq_alarm_arn],
    [for alarm in aws_cloudwatch_metric_alarm.api : alarm.arn],
  )
}

# --- CloudTrail: who touched a photo ------------------------------------------

resource "aws_s3_bucket" "audit_logs" {
  bucket = "everglow-audit-logs-dev"
}

resource "aws_s3_bucket_public_access_block" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    id     = "expire-after-a-year"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_policy" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.audit_logs.arn, "${aws_s3_bucket.audit_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "CloudTrailChecksTheAcl"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.audit_logs.arn
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudTrailWritesLogs"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.audit_logs.arn}/AWSLogs/${local.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = local.trail_arn
          }
        }
      },
    ]
  })
}

resource "aws_cloudtrail" "photos_access" {
  name                       = local.trail_name
  s3_bucket_name             = aws_s3_bucket.audit_logs.id
  is_multi_region_trail      = false
  enable_log_file_validation = true

  # Every read and write of an object in a photos bucket, whoever made it.
  # The app's own traffic is in here too; each bucket's read alert picks out
  # the rest.
  advanced_event_selector {
    name = "Photo object reads and writes"

    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field       = "resources.ARN"
      starts_with = [for photos in local.photo_storage : "${photos.bucket_arn}/"]
    }
  }

  # Changes to policies, keys and the trail itself, so the alerts can see them.
  advanced_event_selector {
    name = "Management writes"

    field_selector {
      field  = "eventCategory"
      equals = ["Management"]
    }
    field_selector {
      field  = "readOnly"
      equals = ["false"]
    }
  }

  depends_on = [aws_s3_bucket_policy.audit_logs]
}

# --- Alerts: email when the rules are tested or changed ------------------------

resource "aws_sns_topic" "security_alerts" {
  name = "everglow-security-alerts-dev"
}

resource "aws_sns_topic_policy" "security_alerts" {
  arn = aws_sns_topic.security_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EventBridgePublishesOurAlerts"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.security_alerts.arn
        Condition = { ArnEquals = { "aws:SourceArn" = local.alert_rules } }
      },
      {
        # CloudWatch alarms publish as CloudWatch, not EventBridge: the image
        # processors' DLQ alarms (modules/photo-storage) and the API log alarms
        # (moderation-alerts.tf). Listed by ARN rather than by a name prefix,
        # so an alarm made outside Terraform cannot post to the security topic
        # and pass for one of ours.
        Sid       = "CloudWatchPublishesOurAlarms"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "sns:Publish"
        Resource  = aws_sns_topic.security_alerts.arn
        Condition = { ArnEquals = { "aws:SourceArn" = local.cloudwatch_alarms } }
      },
    ]
  })
}

# AWS emails each address a confirmation link first; alerts arrive only after
# it is clicked.
resource "aws_sns_topic_subscription" "security_alerts_email" {
  for_each = var.alert_emails

  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

# The controls themselves changed: a bucket policy or encryption setting, a
# KMS key, the trail, or an image processor. Reading a photo past the block
# starts with one of these. (Reads themselves are alerted per bucket, in
# modules/photo-storage/alerts.tf.)
#
# The processor is on the read allowlist, so changing what it runs (code,
# layers, handler, environment, role) or who can act as its role counts the
# same as changing the bucket policy. Deleting and recreating the function
# under its name is CreateFunction. The SQS mapping invokes the unqualified
# function, so versions and aliases cannot swap the code it runs.
#
# The roles allowed to read photos (each image processor's, and the staging
# API's task role) count the same way: who can assume them and what they may
# do. A Copilot deploy that changes the task role's policies alerts too.
#
# Lambda logs functionName as the caller passed it (a name, a full ARN or a
# partial ARN), so it is matched by suffix. IAM takes only the role name.
# Terraform deploys of the processor call UpdateFunctionCode and alert too.
resource "aws_cloudwatch_event_rule" "privacy_controls_changed" {
  name        = "everglow-privacy-controls-changed-dev"
  description = "A bucket policy, KMS key, CloudTrail trail, an image processor function, or a role that may read photos was changed"

  event_pattern = jsonencode({
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      "$or" = [
        {
          eventSource = ["s3.amazonaws.com", "kms.amazonaws.com", "cloudtrail.amazonaws.com"]
          eventName = [
            "PutBucketPolicy", "DeleteBucketPolicy", "PutBucketEncryption", "DeleteBucketEncryption",
            "PutKeyPolicy", "CreateGrant", "DisableKey", "ScheduleKeyDeletion",
            "StopLogging", "DeleteTrail", "UpdateTrail", "PutEventSelectors",
          ]
        },
        {
          eventSource = ["lambda.amazonaws.com"]
          eventName = [
            "CreateFunction20150331", "UpdateFunctionCode20150331v2", "UpdateFunctionConfiguration20150331v2",
          ]
          requestParameters = { functionName = [for photos in local.photo_storage : { suffix = photos.image_processor_function_name }] }
        },
        {
          eventSource = ["iam.amazonaws.com"]
          eventName = [
            "UpdateAssumeRolePolicy", "PutRolePolicy", "DeleteRolePolicy", "AttachRolePolicy", "DetachRolePolicy",
            "PutRolePermissionsBoundary", "DeleteRolePermissionsBoundary",
          ]
          requestParameters = { roleName = flatten([for photos in local.photo_storage : photos.trusted_role_names]) }
        },
      ]
    }
  })
}

resource "aws_cloudwatch_event_target" "privacy_controls_changed" {
  rule = aws_cloudwatch_event_rule.privacy_controls_changed.name
  arn  = aws_sns_topic.security_alerts.arn

  input_transformer {
    input_paths = {
      who    = "$.detail.userIdentity.arn"
      event  = "$.detail.eventName"
      source = "$.detail.eventSource"
      time   = "$.detail.eventTime"
      ip     = "$.detail.sourceIPAddress"
    }
    input_template = "\"<who> called <event> on <source> at <time> from <ip>\""
  }
}
