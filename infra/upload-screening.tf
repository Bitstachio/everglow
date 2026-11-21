# Upload screening (docs/moderation.md §11): the API sends each new photo's
# bytes to Amazon Rekognition's image moderation before guests can see it.
#
# Rekognition is handed the bytes, never a bucket and key, so it needs no S3
# or KMS access of its own and the photos key still names exactly the API and
# the image processor (modules/photo-storage/kms.tf). The API only needs the
# one call. DetectModerationLabels has no resource-level permissions, hence
# Resource "*".
#
# Nothing calls it until MODERATION_SCREENING_ENABLED=true, and that waits for
# the AWS AI services opt-out policy and the privacy policy (README.md).
#
# Staging's task role gets the same permission from its Copilot addon
# (api/copilot/api/addons/rekognition-access.yml), like its S3 rights.

resource "aws_iam_user_policy" "api_rekognition" {
  name = "everglow-api-rekognition"
  user = aws_iam_user.api.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "rekognition:DetectModerationLabels"
        Resource = "*"
      },
    ]
  })
}
