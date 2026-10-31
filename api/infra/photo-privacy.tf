# Keeping users' photos private from people with AWS access (docs/photo-privacy.md).
#
#   KMS key     only the API and image processor can encrypt and decrypt photos
#   CloudTrail  records every read and write of a photo, and every change to
#               the rules below, in a separate log bucket
#   EventBridge emails an alert when anyone but the API or processor reads a
#               photo, or when a bucket policy, a key, the trail, the processor's
#               code or configuration, or its role's trust or permissions change
#
# The bucket policy that blocks reads is with the bucket in main.tf.

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = "us-east-1" # the provider's region
  trail_name = "everglow-photos-dev-access"
  trail_arn  = "arn:aws:cloudtrail:${local.region}:${local.account_id}:trail/${local.trail_name}"
  api_user   = aws_iam_user.api.arn
  # CloudTrail records Lambda as the assumed-role session, not the role ARN.
  # Anyone allowed to assume the role can pick the same session name, so the
  # read alert also checks userIdentity.inScopeOf.credentialsIssuedTo: Lambda
  # sets it to the function it issued the credentials to; AssumeRole does not.
  image_processor_session_arn  = "arn:aws:sts::${local.account_id}:assumed-role/${aws_iam_role.image_processor.name}/${aws_lambda_function.image_processor.function_name}"
  image_processor_function_arn = aws_lambda_function.image_processor.arn
  photo_read_allowlist = [
    local.api_user,
    local.image_processor_session_arn,
  ]
  alert_rules = [aws_cloudwatch_event_rule.photo_read_by_person.arn, aws_cloudwatch_event_rule.privacy_controls_changed.arn]
}

# --- KMS: the photos key --------------------------------------------------------

resource "aws_kms_key" "photos" {
  description             = "Encrypts photos in ${aws_s3_bucket.photos.id}. Only the API and image processor may use it."
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Admins (through their IAM permissions) can manage the key but not
        # use it. CreateGrant is left out on purpose: a grant is another way
        # to use a key. Rewriting this policy is still possible, and alerted.
        Sid       = "AdminsManageButCannotUse"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
        Action = [
          "kms:CreateAlias", "kms:DeleteAlias", "kms:UpdateAlias", "kms:UpdateKeyDescription",
          "kms:Describe*", "kms:Get*", "kms:List*", "kms:PutKeyPolicy",
          "kms:EnableKey", "kms:DisableKey", "kms:EnableKeyRotation", "kms:DisableKeyRotation", "kms:RotateKeyOnDemand",
          "kms:TagResource", "kms:UntagResource", "kms:RevokeGrant",
          "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion",
        ]
        Resource = "*"
      },
      {
        # S3 calls KMS as whoever made the request. App uploads/downloads use
        # URLs the API presigns; derivatives are written by the processor role.
        Sid    = "OnlyTheApiAndProcessorUseTheKey"
        Effect = "Allow"
        Principal = {
          AWS = [
            local.api_user,
            aws_iam_role.image_processor.arn,
          ]
        }
        Action   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "photos" {
  name          = "alias/everglow-photos-dev"
  target_key_id = aws_kms_key.photos.key_id
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

  # Every read and write of an object in the photos bucket, whoever made it.
  # The app's own traffic is in here too; the alert below picks out the rest.
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
      starts_with = ["${aws_s3_bucket.photos.arn}/"]
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

# Someone other than the API read, or tried to read, a photo. Denied attempts
# are included (errorCode AccessDenied): an attempt is worth knowing about.
# The processor's session counts as the processor only when Lambda issued its
# credentials to this function; the same session name from AssumeRole alerts.
resource "aws_cloudwatch_event_rule" "photo_read_by_person" {
  name        = "everglow-photo-read-by-person-dev"
  description = "A photo in ${aws_s3_bucket.photos.id} was read by someone other than the API or image processor"

  event_pattern = jsonencode({
    source        = ["aws.s3"]
    "detail-type" = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource       = ["s3.amazonaws.com"]
      eventName         = ["GetObject"]
      requestParameters = { bucketName = [aws_s3_bucket.photos.id] }
      "$or" = [
        { userIdentity = { arn = [{ "anything-but" = local.photo_read_allowlist }] } },
        {
          userIdentity = {
            arn       = [local.image_processor_session_arn]
            inScopeOf = { credentialsIssuedTo = [{ exists = false }] }
          }
        },
        {
          userIdentity = {
            arn       = [local.image_processor_session_arn]
            inScopeOf = { credentialsIssuedTo = [{ "anything-but" = [local.image_processor_function_arn] }] }
          }
        },
      ]
    }
  })
}

resource "aws_cloudwatch_event_target" "photo_read_by_person" {
  rule = aws_cloudwatch_event_rule.photo_read_by_person.name
  arn  = aws_sns_topic.security_alerts.arn

  input_transformer {
    input_paths = {
      who      = "$.detail.userIdentity.arn"
      issuedTo = "$.detail.userIdentity.inScopeOf.credentialsIssuedTo"
      key      = "$.detail.requestParameters.key"
      time     = "$.detail.eventTime"
      ip       = "$.detail.sourceIPAddress"
      error    = "$.detail.errorCode"
    }
    input_template = "\"Photo read by <who> at <time> from <ip>. Object: <key>. Credentials issued to (empty unless Lambda): <issuedTo>. Error (empty if it succeeded): <error>\""
  }
}

# The controls themselves changed: a bucket policy or encryption setting, a
# KMS key, the trail, or the image processor. Reading a photo past the block
# starts with one of these.
#
# The processor is on the read allowlist, so changing what it runs (code,
# layers, handler, environment, role) or who can act as its role counts the
# same as changing the bucket policy. Deleting and recreating the function
# under its name is CreateFunction. The SQS mapping invokes the unqualified
# function, so versions and aliases cannot swap the code it runs.
#
# Lambda logs functionName as the caller passed it (a name, a full ARN or a
# partial ARN), so it is matched by suffix. IAM takes only the role name.
# Terraform deploys of the processor call UpdateFunctionCode and alert too.
resource "aws_cloudwatch_event_rule" "privacy_controls_changed" {
  name        = "everglow-privacy-controls-changed-dev"
  description = "A bucket policy, KMS key, CloudTrail trail, or the image processor function or role was changed"

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
          requestParameters = { functionName = [{ suffix = aws_lambda_function.image_processor.function_name }] }
        },
        {
          eventSource = ["iam.amazonaws.com"]
          eventName = [
            "UpdateAssumeRolePolicy", "PutRolePolicy", "DeleteRolePolicy", "AttachRolePolicy", "DetachRolePolicy",
            "PutRolePermissionsBoundary", "DeleteRolePermissionsBoundary",
          ]
          requestParameters = { roleName = [aws_iam_role.image_processor.name] }
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
