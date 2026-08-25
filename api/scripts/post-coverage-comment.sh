#!/usr/bin/env bash
# Posts (or updates in place) a sticky PR comment with the unit-test
# coverage summary. One comment per PR, found again by its marker.
#
# Requires: coverage/coverage-summary.json (jest json-summary reporter),
# GH_TOKEN, PR_NUMBER, GITHUB_REPOSITORY.
set -euo pipefail

MARKER="<!-- everglow-api-coverage -->"
SUMMARY_FILE="coverage/coverage-summary.json"
[ -f "$SUMMARY_FILE" ] || { echo "missing $SUMMARY_FILE — run jest with --coverage first" >&2; exit 1; }

body="$(node -e '
const fs = require("fs");
const summary = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const total = summary.total;
const row = (label, m) => `| ${label} | ${m.pct}% (${m.covered}/${m.total}) |`;
const lines = [
  "<!-- everglow-api-coverage -->",
  "### API unit-test coverage",
  "",
  "| Metric | Coverage |",
  "| --- | --- |",
  row("Statements", total.statements),
  row("Branches", total.branches),
  row("Functions", total.functions),
  row("Lines", total.lines),
  "",
  "_Unit suite only; controllers are exercised by the e2e suite._",
];
process.stdout.write(lines.join("\n"));
' "$SUMMARY_FILE")"

# Also surface it on the workflow run page.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "$body" >>"$GITHUB_STEP_SUMMARY"
fi

existing_id="$(gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"$MARKER\"))][0].id // empty")"

if [ -n "$existing_id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing_id" -f body="$body" >/dev/null
  echo "updated existing coverage comment ($existing_id)"
else
  gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -f body="$body" >/dev/null
  echo "created coverage comment"
fi
