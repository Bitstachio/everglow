output "dev_photos_bucket_name" {
  description = "The dev photos bucket (AWS_S3_BUCKET in api/.env)."
  value       = module.photos_dev.bucket_name
}

output "dev_photos_bucket_arn" {
  description = "ARN of the dev photos bucket."
  value       = module.photos_dev.bucket_arn
}

output "staging_photos_bucket_name" {
  description = "The staging photos bucket (AWS_S3_BUCKET for staging in api/copilot/api/manifest.yml)."
  value       = module.photos_staging.bucket_name
}

output "staging_photos_bucket_arn" {
  description = "ARN of the staging photos bucket. The Copilot addon in api/copilot/api/addons/ grants the staging task role access to it."
  value       = module.photos_staging.bucket_arn
}
