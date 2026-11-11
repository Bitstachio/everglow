# Email when someone other than the API or the image processor reads, or
# tries to read, a photo in this bucket (docs/photo-privacy.md).
#
# EventBridge sees the read only if a trail records this bucket's object data
# events, and the topic sends it only if its policy allows this rule. Both
# live in the root module (photo-privacy.tf) and are shared by every bucket.

locals {
  # CloudTrail records Lambda as the assumed-role session, not the role ARN.
  # Anyone allowed to assume the role can pick the same session name, so the
  # read alert also checks userIdentity.inScopeOf.credentialsIssuedTo: Lambda
  # sets it to the function it issued the credentials to; AssumeRole does not.
  image_processor_session_arn  = "arn:aws:sts::${local.account_id}:assumed-role/${aws_iam_role.image_processor.name}/${aws_lambda_function.image_processor.function_name}"
  image_processor_function_arn = aws_lambda_function.image_processor.arn
  photo_read_allowlist = concat(
    [for user in var.api_users : user.arn],
    [local.image_processor_session_arn],
  )
}

# Denied attempts are included (errorCode AccessDenied): an attempt is worth
# knowing about. The processor's session counts as the processor only when
# Lambda issued its credentials to this function; the same session name from
# AssumeRole alerts.
resource "aws_cloudwatch_event_rule" "photo_read_by_person" {
  name        = "everglow-photo-read-by-person-${var.environment}"
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
  arn  = var.alert_topic_arn

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
