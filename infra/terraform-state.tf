# Shared Terraform state: one copy in S3 that everyone plans and applies
# against, instead of a terraform.tfstate on each laptop.
#
# The backend block in main.tf points here. Terraform locks the state with a
# lock file next to it (use_lockfile), so two applies can't run at once.
# Versioning keeps every earlier state for 90 days, so a bad apply can be
# rolled back by restoring the previous version.
#
# This bucket holds the state that describes it, so it can't be destroyed from
# here (prevent_destroy). Creating or changing its policy or encryption sends
# one control-change alert (photo-privacy.tf), like any other bucket.

locals {
  terraform_state_key = "dev/terraform.tfstate"
}

resource "aws_s3_bucket" "terraform_state" {
  bucket = "everglow-terraform-state"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# The state holds resource ids, ARNs and the alert addresses, no secrets (the
# API's access key is deliberately not managed here; see photos.tf).
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.terraform_state]
}

resource "aws_s3_bucket_policy" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*",
        ]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.terraform_state]
}

# What a developer needs to use the shared state, on top of the rights to the
# resources they change. Attach it to a person's IAM user (or a group) to let
# them plan; applying still needs rights to the resources themselves.
resource "aws_iam_policy" "terraform_state" {
  name        = "everglow-terraform-state"
  description = "Read and write the shared Terraform state and its lock in ${aws_s3_bucket.terraform_state.id}."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.terraform_state.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.terraform_state.arn}/${local.terraform_state_key}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.terraform_state.arn}/${local.terraform_state_key}.tflock"
      },
    ]
  })
}
