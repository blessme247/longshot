#!/usr/bin/env bash
# Pre-commit secret scan. Blocks a commit if staged content contains anything
# that looks like a live credential. Deliberately simple (no external deps) so
# it works during a crunch; tune the patterns as the project grows.
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$staged" ] && exit 0

# Patterns for actual secret VALUES (not variable names / placeholders).
patterns=(
  'txoracle_api_[a-f0-9]{16,}'                 # TxLINE activated API token
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'  # JWT
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'         # PEM private key
  '"?\[( ?[0-9]{1,3},){31,}'                   # 32+ byte numeric secret-key array
  '(SESSION_SECRET|ADMIN_TOKEN|TXLINE_API_TOKEN)=[A-Za-z0-9]{16,}'  # inline secret assignment
)

hits=0
for f in $staged; do
  # Skip example/placeholder files.
  case "$f" in *.example) continue;; esac
  for p in "${patterns[@]}"; do
    if git show ":$f" 2>/dev/null | grep -nEq "$p"; then
      echo "BLOCKED: possible secret in $f (pattern: $p)"
      hits=1
    fi
  done
done

if [ "$hits" -ne 0 ]; then
  echo "Commit blocked by secret scan. Move the value to .dev.vars / a wrangler secret."
  echo "If this is a false positive, review carefully, then: git commit --no-verify"
  exit 1
fi
exit 0
