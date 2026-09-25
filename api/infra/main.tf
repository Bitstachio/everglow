# Everglow AWS infrastructure — dev.
#
# This file *describes* what exists in AWS; it does not run anything by itself.
#   terraform plan   → shows the diff between this file and reality
#   terraform apply  → makes reality match the file
#
# State is local for now (terraform.tfstate, gitignored) — moves to a shared
# backend when deployment work starts. The API's access key is deliberately
# NOT managed here: Terraform state would store the secret in plaintext. It
# was created with `aws iam create-access-key` and lives only in api/.env.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region  = "us-east-1"
  profile = "mehrshad@everglow.social" # admin profile; the API never uses this
}

# --- S3: photo storage (see docs/photos-architecture.md) ----------------------

resource "aws_s3_bucket" "photos" {
  bucket = "everglow-photos-dev"
}

resource "aws_s3_bucket_public_access_block" "photos" {
  bucket = aws_s3_bucket.photos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# One policy per bucket, so every rule for the photos bucket lives here.
resource "aws_s3_bucket_policy" "photos" {
  bucket = aws_s3_bucket.photos.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          # Refuse any non-HTTPS access.
          Sid       = "DenyInsecureTransport"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:*"
          Resource  = [aws_s3_bucket.photos.arn, "${aws_s3_bucket.photos.arn}/*"]
          Condition = { Bool = { "aws:SecureTransport" = "false" } }
        },
      ],
      # Photos are users' private data: only the API reads them. An explicit
      # Deny beats any Allow, so this holds for admins too; opening a photo
      # means changing this policy first, which CloudTrail records and the
      # alerts below report. The app is unaffected: its download URLs are
      # presigned by the API, so AWS sees the API reading. See
      # docs/photo-privacy.md.
      var.allow_human_photo_reads ? [] : [
        {
          Sid       = "OnlyTheApiReadsPhotos"
          Effect    = "Deny"
          Principal = "*"
          Action    = ["s3:GetObject", "s3:GetObjectVersion"]
          Resource  = "${aws_s3_bucket.photos.arn}/*"
          Condition = { ArnNotEquals = { "aws:PrincipalArn" = aws_iam_user.api.arn } }
        },
      ],
    )
  })
}

# The policy used to hold only the TLS rule under this name.
moved {
  from = aws_s3_bucket_policy.photos_tls_only
  to   = aws_s3_bucket_policy.photos
}

# New objects are encrypted with a key only the API may use, so S3 read
# access alone is not enough to see a photo. Objects uploaded before this
# keep S3-managed encryption. Bucket keys cut the KMS calls (and cost) per
# object; CloudTrail still records every object read.
resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.photos.arn
    }
    bucket_key_enabled = true
  }
}

# Browsers only — native mobile uploads ignore CORS. Tighten allowed_origins
# to real web origins when a web client exists.
resource "aws_s3_bucket_cors_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  cors_rule {
    allowed_origins = ["*"]
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Half-finished multipart uploads are invisible but billed — sweep them daily.
resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# --- IAM: the identity the API runs as ----------------------------------------

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
        Resource = "${aws_s3_bucket.photos.arn}/*"
      },
      {
        # Load-bearing: without ListBucket, HeadObject on a missing key
        # returns 403 instead of 404 and the photo confirm flow breaks.
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.photos.arn
      },
    ]
  })
}
