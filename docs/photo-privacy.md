# Keeping photos private from staff

Users' photos are theirs. The API needs to read them to serve the app, but no person with AWS access should be able to browse them. The owner of an AWS account can never be locked out completely, since they can always change the rules. So the goal is that **nobody reads a photo by accident, and every deliberate read is recorded and reported**.

The Terraform is in `api/infra/`: the bucket policy in `main.tf`, the rest in `photo-privacy.tf`.

## The layers

| Layer         | What it does                                                                                                                      | Where                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Bucket policy | Denies `s3:GetObject` to everyone except the API and the image processor's Lambda session, admins included. An explicit Deny beats any Allow.                   | `aws_s3_bucket_policy.photos`  |
| KMS key       | New photos are encrypted with a key only the API and image processor may use. Admins can manage the key but not decrypt with it.                      | `aws_kms_key.photos`           |
| CloudTrail    | Records every read and write of a photo, and every write to the account's configuration, in `everglow-audit-logs-dev` for a year. | `aws_cloudtrail.photos_access` |
| Alerts        | Emails when anyone but the API or image processor reads or tries to read a photo, or when a bucket policy, a key, the trail, the image processor function or its role changes.               | `aws_cloudwatch_event_rule.*`  |

**The app is unaffected.** Phones upload and download through URLs the API presigns with its own credentials. To AWS, every one of those requests is the API. That is also why S3 asks KMS on the API's behalf, and why the key trusts the API. The image processor role also reads originals and writes derivatives; its normal reads are excluded from the person-read alert. It cannot read derivatives or moderation evidence through its IAM policy.

**The image processor counts as the processor only when Lambda runs it.** The bucket policy exempts only the session Lambda opens for the function (`<role id>:everglow-image-processor-dev`), not every session of the role. A bucket policy cannot tell Lambda from a person who assumes the role under the same session name: `lambda:SourceFunctionArn` is only allowed in identity policies. So the read alert also checks `userIdentity.inScopeOf.credentialsIssuedTo` in CloudTrail, which Lambda sets to the function it gave the credentials to and `AssumeRole` does not. A read in the processor's name without it alerts like any other person's read.

**Getting past the controls is visible.** Reading a photo as a person means one of these:

- rewriting the bucket policy,
- rewriting the key policy,
- turning off the trail,
- changing the image processor's code or configuration (`CreateFunction`, `UpdateFunctionCode`, `UpdateFunctionConfiguration`, which covers layers, environment and role), or
- changing who can assume its role or what the role may do (`UpdateAssumeRolePolicy`, `PutRolePolicy`, `DeleteRolePolicy`, `AttachRolePolicy`, `DetachRolePolicy`, and the permissions boundary calls).

Each one is itself alerted. Applying Terraform that redeploys the image processor calls `UpdateFunctionCode`, so a deploy raises the same alert as a bucket policy change.

## Dev versus production

In dev:

- **The API's key is shared with the mobile developers** ([local-setup.md](../api/docs/local-setup.md)). Anyone with it can read photos, and to AWS they look like the API, so no alert fires. This is acceptable for test photos. In production the API's credentials never leave the server.
- **`allow_human_photo_reads = true`** in `terraform.tfvars` lifts the read block for debugging. Applying it changes the bucket policy, which raises an alert. It only opens photos from before the KMS key: newer ones stay unreadable to people, because only the API and image processor may decrypt them. To see one of your own test photos, open it in the app.
- **Files can still be listed, and the bucket policy is not locked,** so Terraform can keep changing it.
- **Photos uploaded before the KMS key existed** keep S3-managed encryption. The bucket policy still blocks reading them.

Production, before launch (EV-37):

- A separate AWS account, and an API role whose credentials never leave the server.
- The bucket policy is also locked against edits, except by a break-glass role.
- Logs go to a separate account, with Object Lock so nobody can delete them.
- Photos are viewed for moderation only through the Admin dashboard, and every view is audited.
- For the rare legitimate need outside the dashboard, such as a legal request or an incident, a break-glass role may read and decrypt photos. Assuming it needs MFA, it can be scoped to one object and a short session, and every use fires the existing alerts. A short written process says who approves it and where the reason is recorded.

## Applying

```sh
cd api/infra
cp terraform.tfvars.example terraform.tfvars   # set alert_emails; the repo is public, keep it out of git
# Build the image-processor artifact first from the repository root:
# (cd functions/image-processor && pnpm install --frozen-lockfile && pnpm build)
# Use your own admin AWS profile; Terraform no longer selects one.
terraform plan
terraform apply
```

AWS then emails a confirmation link to each address in `alert_emails`. Alerts arrive only after it is clicked. CloudTrail delivers events a few minutes after they happen, so an alert can take up to about 15 minutes.

The state is local and gitignored. Before planning, obtain the latest shared dev state from whoever last applied. Back up the existing state and verify that the incoming file has the same lineage and a newer serial. Replacing this file updates local bookkeeping only; it does not deploy code or change AWS resources.
