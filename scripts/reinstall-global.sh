#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building..."
npm run build

echo "Uninstalling git-mem globally..."
npm uninstall -g git-mem 2>/dev/null || true

echo "Installing git-mem globally from $(pwd)..."
npm install -g .

echo ""
echo "Installed:"
git-mem --version
which git-mem
which git-mem-mcp
