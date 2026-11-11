# Photo storage, one modules/photo-storage per environment: the bucket and its
# privacy rules, the photos KMS key, the image processor and its queue, and
# the alert on reads by people (docs/photos-architecture.md,
# docs/photo-privacy.md).
#
# What every bucket shares lives in photo-privacy.tf: the trail that records
# reads, the alert topic, and the alert on changes to the controls. A new
# instance has to be added there too (local.photo_storage).
#
# Before plan/apply, build the zip the image processor deploys:
#   cd functions/image-processor && pnpm build

locals {
  image_processor_zip = "${path.module}/../functions/image-processor/dist/function.zip"
}

# --- Dev: the shared bucket every developer's database uses ------------------

module "photos_dev" {
  source = "./modules/photo-storage"

  environment             = "dev"
  api_users               = [{ arn = aws_iam_user.api.arn, unique_id = aws_iam_user.api.unique_id }]
  allow_human_photo_reads = var.allow_human_photo_reads
  image_processor_zip     = local.image_processor_zip
  alert_topic_arn         = aws_sns_topic.security_alerts.arn
}

# The identity the dev API runs as. Its access key is deliberately NOT managed
# here: Terraform state would store the secret in plaintext. It was created
# with `aws iam create-access-key` and lives only in api/.env.
resource "aws_iam_user" "api" {
  name = "everglow-api-dev"
}

resource "aws_iam_user_policy" "api_s3" {
  name = "everglow-api-s3"
  user = aws_iam_user.api.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Exactly what S3Service calls — nothing else.
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${module.photos_dev.bucket_arn}/*"
      },
      {
        # Load-bearing: without ListBucket, HeadObject on a missing key
        # returns 403 instead of 404 and the photo confirm flow breaks.
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = module.photos_dev.bucket_arn
      },
    ]
  })
}
