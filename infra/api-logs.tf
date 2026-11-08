# Search and a dashboard for the API's CloudWatch logs.
#
# Pair with moderation-alerts.tf: same var.api_log_group_name, same short name
# in api-log-group.tf. This file only reads the group (saved queries and a
# dashboard). Metric filters and alarms for the same lines live next door.
# Apply still succeeds before the group exists; a query against a missing
# group returns no rows.
#
# Production writes one JSON object per line
# (api/src/common/logging/logging.config.ts). Saved queries filter on the JSON
# fields, never on the message (api/docs/alerting.md §1). REQUEST_ID and
# EVENT_NAME are placeholders: replace them in the console before running.
# The request id is `req.id` (logging.config.ts serializes the request to
# { id, method, url }). Pino's `level` is a number; 50 is error.

locals {
  api_log_source = "SOURCE ${jsonencode(var.api_log_group_name)}"

  api_log_queries = {
    request = {
      name = "Everglow/API/lines for one request"
      query = trimspace(<<-EOT
        fields @timestamp, level, event, msg, req.id, errorCode, errorReason
        | filter req.id = "REQUEST_ID"
        | sort @timestamp asc
      EOT
      )
    }
    event = {
      name = "Everglow/API/lines for one event"
      query = trimspace(<<-EOT
        fields @timestamp, level, event, msg, req.id
        | filter event = "EVENT_NAME"
        | sort @timestamp desc
        | limit 100
      EOT
      )
    }
    errors = {
      name = "Everglow/API/errors"
      query = trimspace(<<-EOT
        fields @timestamp, level, event, msg, req.id, errorCode, errorReason
        | filter level >= 50
        | sort @timestamp desc
        | limit 100
      EOT
      )
    }
    heartbeats = {
      name = "Everglow/API/scheduler heartbeats"
      query = trimspace(<<-EOT
        fields @timestamp, event, durationMs, failed, completed
        | filter event like /\.run_completed$/
        | sort @timestamp desc
        | limit 50
      EOT
      )
    }
  }
}

resource "aws_cloudwatch_query_definition" "api" {
  for_each = local.api_log_queries

  name            = each.value.name
  log_group_names = [var.api_log_group_name]
  query_string    = each.value.query
}

resource "aws_cloudwatch_dashboard" "api" {
  # Same short name as the alarm prefix (api-log-group.tf), e.g.
  # everglow-staging-api. Dashboard names cannot contain "/".
  dashboard_name = local.api_log_name_prefix

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 3
        properties = {
          markdown = join("\n", [
            "# API logs",
            "",
            "Group `${var.api_log_group_name}`. Saved queries: lines for one request (`REQUEST_ID`), lines for one event (`EVENT_NAME`), errors, scheduler heartbeats.",
            "Alarms on these lines: `infra/moderation-alerts.tf` (see `api/docs/alerting.md`).",
          ])
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 3
        width  = 12
        height = 6
        properties = {
          title  = "Unhandled errors"
          region = local.region
          view   = "timeSeries"
          query  = "${local.api_log_source} | filter event = \"request.unhandled_error\" | stats count() as errors by bin(5m)"
        }
      },
      {
        type   = "log"
        x      = 12
        y      = 3
        width  = 12
        height = 6
        properties = {
          title  = "Requests"
          region = local.region
          view   = "timeSeries"
          query  = "${local.api_log_source} | filter ispresent(req.method) | stats count() as requests by bin(5m)"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 9
        width  = 24
        height = 6
        properties = {
          title  = "Recent errors"
          region = local.region
          view   = "table"
          query  = "${local.api_log_source} | ${local.api_log_queries.errors.query}"
        }
      },
      {
        type   = "log"
        x      = 0
        y      = 15
        width  = 24
        height = 6
        properties = {
          title  = "Scheduler heartbeats"
          region = local.region
          view   = "table"
          query  = "${local.api_log_source} | ${local.api_log_queries.heartbeats.query}"
        }
      },
    ]
  })
}
