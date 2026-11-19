#!/usr/bin/env bash
# Run `firebase deploy --only <targets>` in CI. On failure, repeat the error lines as a GitHub
# annotation (visible on the run page without opening the log). Only the CLI's own output is
# used, never firebase-debug.log, so no tokens can leak.
set -uo pipefail
targets="$1"
out="$(mktemp)"
npx firebase deploy --only "$targets" --project "$FIREBASE_PROJECT" --non-interactive \
  --message "GitHub ${GITHUB_SHA:-local}" 2>&1 | tee "$out"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg="$(grep -iE 'error|denied|permission|failed' "$out" | grep -v '^\s*$' | tail -n 8 | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')"
  echo "::error title=firebase deploy --only ${targets} failed::${msg}"
fi
exit "$code"
