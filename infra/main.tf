# Everglow AWS infrastructure — dev and staging, in one account and one state.
#
# This file *describes* what exists in AWS; it does not run anything by itself.
#   terraform plan   → shows the diff between this file and reality
#   terraform apply  → makes reality match the file
#
# State is shared in S3 (terraform-state.tf), locked while anyone plans or
# applies; see README.md. The photo stack is in photos.tf.

terraform {
  # 1.10 is the first with S3 lock files (use_lockfile).
  required_version = ">= 1.10"

  # The bucket is defined in terraform-state.tf. A backend block can't use
  # variables, so the names are repeated here.
  backend "s3" {
    bucket       = "everglow-terraform-state"
    key          = "dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}
