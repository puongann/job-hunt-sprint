#!/usr/bin/env bash
# CI helper (GitHub Actions): turns the repo secrets into a clean Firebase config.
# - The project ID is read from the service account key (FIREBASE_SERVICE_ACCOUNT),
#   so a wrong VITE_FIREBASE_PROJECT_ID secret cannot break the deploy.
# - Values pasted with extra bits (apiKey: "...", quotes, trailing comma, spaces) are cleaned.
# - authDomain / storageBucket default from the project ID when not set.
# Writes VITE_* and FIREBASE_PROJECT to $GITHUB_ENV and the key to $RUNNER_TEMP/sa.json.
set -euo pipefail

clean() {
  printf '%s' "$1" | tr -d '\r\n' \
    | sed -E "s/^[[:space:]]*([A-Za-z_]+[[:space:]]*[:=][[:space:]]*)?[\"']?//; s/[\"']?[[:space:]]*,?[[:space:]]*$//"
}

if [ -z "${SA:-}" ]; then
  echo "::error::Missing GitHub secret FIREBASE_SERVICE_ACCOUNT (see README, 'GitHub + automatic deploy')"
  exit 1
fi
printf '%s' "$SA" > "$RUNNER_TEMP/sa.json"
pid=$(jq -r '.project_id // empty' "$RUNNER_TEMP/sa.json" 2>/dev/null || true)
if [ -z "$pid" ]; then
  echo "::error::FIREBASE_SERVICE_ACCOUNT is not a service account key. Paste the WHOLE .json file (it starts with { and contains \"project_id\")."
  exit 1
fi

given=$(clean "${IN_PROJECT_ID:-}")
if [ -n "$given" ] && [ "$given" != "$pid" ]; then
  echo "::warning::Secret VITE_FIREBASE_PROJECT_ID does not match the service account's project. Using the service account's project ID instead."
fi

api=$(clean "${IN_API_KEY:-}")
app=$(clean "${IN_APP_ID:-}")
auth=$(clean "${IN_AUTH_DOMAIN:-}");   [ -z "$auth" ] && auth="$pid.firebaseapp.com"
bucket=$(clean "${IN_STORAGE_BUCKET:-}"); [ -z "$bucket" ] && bucket="$pid.appspot.com"
sender=$(clean "${IN_SENDER_ID:-}")

missing=""
[ -z "$api" ] && missing="$missing VITE_FIREBASE_API_KEY"
[ -z "$app" ] && missing="$missing VITE_FIREBASE_APP_ID"
if [ -n "$missing" ]; then
  echo "::error::Missing GitHub secrets:$missing (see README, 'GitHub + automatic deploy')"
  exit 1
fi

{
  echo "FIREBASE_PROJECT=$pid"
  echo "VITE_FIREBASE_PROJECT_ID=$pid"
  echo "VITE_FIREBASE_API_KEY=$api"
  echo "VITE_FIREBASE_APP_ID=$app"
  echo "VITE_FIREBASE_AUTH_DOMAIN=$auth"
  echo "VITE_FIREBASE_STORAGE_BUCKET=$bucket"
  echo "VITE_FIREBASE_MESSAGING_SENDER_ID=$sender"
  echo "VITE_USE_EMULATOR=false"
} >> "$GITHUB_ENV"
echo "Firebase project: $pid"
