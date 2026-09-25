#!/usr/bin/env bash
# Posts (or updates in place) one sticky PR comment with a Jest coverage
# summary. Each caller uses its own marker, so a PR that touches both the API
# and the mobile app gets one API comment and one mobile comment, each kept
# current by later pushes.
#
# Usage: post-coverage-comment.sh <marker> <title> <note> <label=summary.json>...
#   marker  unique id for this comment, e.g. everglow-api-coverage
#   title   heading shown on the comment
#   note    one-line caveat under the table (may be empty)
#   label=summary.json  one column per Jest json-summary file
#
# Requires GH_TOKEN, PR_NUMBER and GITHUB_REPOSITORY.
set -euo pipefail

[ "$#" -ge 4 ] || { echo "usage: $0 <marker> <title> <note> <label=summary.json>..." >&2; exit 2; }
marker="<!-- $1 -->"
title="$2"
note="$3"
shift 3

for pair in "$@"; do
  file="${pair#*=}"
  [ -f "$file" ] || { echo "missing $file: run jest with --coverage and the json-summary reporter first" >&2; exit 1; }
done

body="$(node -e '
const fs = require("fs");
const [marker, title, note, ...pairs] = process.argv.slice(1);
const suites = pairs.map((pair) => {
  const at = pair.indexOf("=");
  return { label: pair.slice(0, at), total: JSON.parse(fs.readFileSync(pair.slice(at + 1), "utf8")).total };
});
const cell = (m) => `${m.pct}% (${m.covered}/${m.total})`;
const metrics = [["Statements", "statements"], ["Branches", "branches"], ["Functions", "functions"], ["Lines", "lines"]];
const lines = [
  marker,
  `### ${title}`,
  "",
  `| Metric | ${suites.map((s) => s.label).join(" | ")} |`,
  `| --- |${suites.map(() => " --- |").join("")}`,
  ...metrics.map(([name, key]) => `| ${name} | ${suites.map((s) => cell(s.total[key])).join(" | ")} |`),
];
if (note) lines.push("", `_${note}_`);
process.stdout.write(lines.join("\n"));
' "$marker" "$title" "$note" "$@")"

# Also surface it on the workflow run page.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "$body" >>"$GITHUB_STEP_SUMMARY"
fi

existing_id="$(gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"$marker\"))][0].id // empty")"

if [ -n "$existing_id" ]; then
  gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing_id" -f body="$body" >/dev/null
  echo "updated existing coverage comment ($existing_id)"
else
  gh api "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -f body="$body" >/dev/null
  echo "created coverage comment"
fi
