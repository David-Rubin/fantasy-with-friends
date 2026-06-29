#!/bin/bash
set -e

# Run this script once from inside the fantasy-with-friends folder
# to create the GitHub repo and push the initial commit.
# Requires: git, gh (GitHub CLI authenticated)

cd "$(dirname "$0")"

echo "Installing dependencies..."
npm install

echo "Initializing git..."
git init
git add .
git commit -m "chore: initial project setup

- Vite + React + TypeScript scaffold
- ESLint + Prettier
- Vitest + Testing Library
- GitHub Actions CI"

echo "Creating GitHub repo and pushing..."
gh repo create fantasy-with-friends \
  --description "Fantasy sports with friends" \
  --public \
  --source=. \
  --remote=origin \
  --push

echo ""
echo "✅ Done! Repo URL:"
gh repo view --json url -q .url
