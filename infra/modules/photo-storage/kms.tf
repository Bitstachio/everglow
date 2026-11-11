# The photos key: only the API and the image processor can encrypt and
# decrypt photos (docs/photo-privacy.md).

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
        # Naming the principals here is enough: they need no KMS rights in
        # their own IAM policies.
        Sid    = "OnlyTheApiAndProcessorUseTheKey"
        Effect = "Allow"
        Principal = {
          AWS = concat(
            [for user in var.api_users : user.arn],
            [aws_iam_role.image_processor.arn],
          )
        }
        Action   = ["kms:GenerateDataKey", "kms:Decrypt", "kms:DescribeKey"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "photos" {
  name          = "alias/everglow-photos-${var.environment}"
  target_key_id = aws_kms_key.photos.key_id
}
