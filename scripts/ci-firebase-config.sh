#!/usr/bin/env bash
# CI helper (GitHub Actions): turns the repo secrets into a clean Firebase config.
# - The project ID is read from the service account key (FIREBASE_SERVICE_ACCOUNT),
#   so a wrong VITE_FIREBASE_PROJECT_ID secret cannot break the deploy.
# - Values pasted with extra bits (apiKey: "...", quotes, trailing comma, spaces) are cleaned.
# - The web config comes from Firebase Hosting's /__/firebase/init.json when available,
#   so wrong VITE_* secrets cannot break the site. authDomain / storageBucket default from the project ID.
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

# Firebase Hosting serves the project's real web config at /__/firebase/init.json.
# It is the source of truth; the secrets are only a fallback (e.g. before the first deploy).
hosted=$(curl -fsS --max-time 15 "https://$pid.web.app/__/firebase/init.json" 2>/dev/null || true)
from_hosted() { printf '%s' "$hosted" | jq -r --arg k "$1" '.[$k] // empty' 2>/dev/null || true; }
pick() { local h; h=$(from_hosted "$1"); if [ -n "$h" ]; then printf '%s' "$h"; else clean "$2"; fi; }

api=$(pick apiKey "${IN_API_KEY:-}")
app=$(pick appId "${IN_APP_ID:-}")
auth=$(pick authDomain "${IN_AUTH_DOMAIN:-}");       [ -z "$auth" ] && auth="$pid.firebaseapp.com"
bucket=$(pick storageBucket "${IN_STORAGE_BUCKET:-}"); [ -z "$bucket" ] && bucket="$pid.appspot.com"
sender=$(pick messagingSenderId "${IN_SENDER_ID:-}")
if [ -n "$hosted" ]; then echo "Web config: taken from Firebase Hosting (init.json)"; else echo "Web config: taken from the GitHub secrets"; fi

if [ -z "$api" ]; then
  echo "::error::No web API key: set the GitHub secret VITE_FIREBASE_API_KEY (see README, 'GitHub + automatic deploy')"
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
