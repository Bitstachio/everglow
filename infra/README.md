# Infrastructure

Terraform for the shared dev AWS account: the photos bucket and its privacy
controls, the image processor, and the API's log alerts. What each file holds
is in its header comment; why is in [docs/photo-privacy.md](../docs/photo-privacy.md)
and [api/docs/alerting.md](../api/docs/alerting.md).

## State

There is one copy of the state, in S3: `s3://everglow-terraform-state/dev/terraform.tfstate`
(the bucket is defined in [terraform-state.tf](terraform-state.tf)). Terraform
locks it with a lock file beside it while anyone plans or applies, so two
applies can't overlap, and versioning keeps every earlier state for 90 days.

Nobody keeps a `terraform.tfstate` on their laptop. An old local one, including
one left in `api/infra/` from before Terraform moved here, is out of date: don't
apply from it, and don't copy it into this folder.

## Access

You need an IAM user in the account with rights to the resources you change,
plus the `everglow-terraform-state` policy (read and write the state and its
lock). The account owner attaches it in IAM → Users → Add permissions.

## Plan and apply

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars   # once; set alert_emails, keep it out of git
(cd ../functions/image-processor && pnpm install --frozen-lockfile && pnpm build)
export AWS_PROFILE=<your profile>
terraform init     # once, and again after the provider or backend changes
terraform plan
terraform apply
```

- Apply from an up-to-date `main`. An apply from an old branch can remove what
  a newer one added, and `aws_s3_bucket_notification` replaces the bucket's
  whole notification configuration.
- Read the plan before applying. Anything it would destroy or replace that you
  didn't mean to change is a reason to stop and ask.
- Say in the team channel when you apply, and what changed.

## If a lock is stuck

A plan or apply that was killed can leave `dev/terraform.tfstate.tflock`
behind, and every later run then waits for it. Make sure nobody is running
Terraform, then `terraform force-unlock <lock id>` with the id from the error.

## Rolling back the state

Every apply writes a new version of the state object. To go back to an
earlier one, find it with
`aws s3api list-object-versions --bucket everglow-terraform-state --prefix dev/terraform.tfstate`
and restore it by copying that version over the current one. This changes
only Terraform's record, not AWS; plan afterwards to see the difference.
