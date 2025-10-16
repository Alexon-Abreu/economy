#!/usr/bin/env bash
set -euo pipefail
# Usage: ./setup.sh <your_github_username> <FRED_API_KEY>
USER="${1:?github username required}"
FRED="${2:?FRED API key required}"
REPO="economy"

# Create repo
gh repo create "$USER/$REPO" --public -y

# Push contents
git init
git branch -m main
git add .
git commit -m "feat: initial Economy dashboard"
git remote add origin "https://github.com/$USER/$REPO.git"
git push -u origin main

# Secrets/vars
gh secret set FRED_API_KEY -b "$FRED" -R "$USER/$REPO"
# Optional divisor override example:
# gh variable set BILLIONS_PER_POINT -b "1.05" -R "$USER/$REPO"

# Enable Pages from branch
gh api -X PUT repos/$USER/$REPO/pages --input - <<'JSON'
{ "build_type": "legacy" }
JSON
gh api -X PUT repos/$USER/$REPO/pages --input - <<'JSON'
{ "source": { "branch": "main", "path": "/" } }
JSON

echo "Done. Site will be at: https://$USER.github.io/$REPO/"
