#!/usr/bin/env bash
# Fails in seconds when the API the Mac smoke signs in against is not answering,
# so a staging outage is not mistaken for an app failure after a long build.
#
# Usage: scripts/check-maestro-api.sh <api-base-url>
#
# Calls the API's liveness route, `GET /` (`AppController.getHello` in
# api/src/app.controller.ts; it skips rate limiting and needs no token).
# Retries a few times with a short timeout to ride out a cold start. The URL is
# never printed: in CI it comes from a repository secret.
set -euo pipefail

base="${1:-}"
if [ -z "$base" ]; then
  echo "Usage: $0 <api-base-url>" >&2
  exit 2
fi

attempts="${API_CHECK_ATTEMPTS:-4}"
delay="${API_CHECK_DELAY_SECONDS:-5}"
url="${base%/}/"

for attempt in $(seq 1 "$attempts"); do
  status=0
  code="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 5 --max-time 10 "$url")" || status=$?
  if [ "$status" -eq 0 ] && [ "$code" -ge 200 ] && [ "$code" -lt 300 ]; then
    echo "API health check passed (GET / returned $code on attempt $attempt)."
    exit 0
  fi
  if [ "$status" -ne 0 ]; then
    echo "API health check attempt $attempt/$attempts: no response (curl exit $status)."
  else
    echo "API health check attempt $attempt/$attempts: GET / returned $code."
  fi
  if [ "$attempt" -lt "$attempts" ]; then sleep "$delay"; fi
done

echo "::error::The API in EXPO_PUBLIC_API_URL did not answer GET / after $attempts attempts. Check that staging is up before re-running; the smoke would fail at sign-in."
exit 1
