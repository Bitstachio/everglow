# Shared identity for the Copilot API log group.
#
# Copilot creates `/copilot/<app>-<env>-<svc>` when the service is deployed.
# Terraform never creates that group. Search (api-logs.tf) and alerts
# (moderation-alerts.tf) both read var.api_log_group_name and share the
# short name below for dashboards, query labels, and alarm prefixes.

locals {
  # "/copilot/everglow-staging-api" -> "everglow-staging-api"
  api_log_name_prefix = replace(trimprefix(trimprefix(var.api_log_group_name, "/copilot/"), "/"), "/", "-")
}
