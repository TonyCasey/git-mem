#!/bin/bash
# Reinstall git-mem globally from local build
# Usage: ./scripts/reinstall-global.sh
#
# This script:
# 1. Builds the project and creates a .tgz package
# 2. Uninstalls existing global git-mem
# 3. Installs the new package globally
# 4. Verifies installation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASES_DIR="$PROJECT_ROOT/releases"

echo "=== git-mem Local Reinstall ==="
echo ""

# Step 1: Package (builds + creates tgz)
echo "1. Building and packaging..."
cd "$PROJECT_ROOT"
npm run package

# Find the latest .tgz file
PACKAGE_FILE=$(ls -t "$RELEASES_DIR"/*.tgz 2>/dev/null | head -1)
if [ -z "$PACKAGE_FILE" ]; then
  echo "Error: No .tgz file found in $RELEASES_DIR"
  exit 1
fi
echo "   Package: $PACKAGE_FILE"

# Step 2: Uninstall existing
echo ""
echo "2. Uninstalling existing global git-mem..."
npm uninstall -g git-mem 2>/dev/null || true

# Step 3: Install new package
echo ""
echo "3. Installing new package globally..."
npm install -g "$PACKAGE_FILE"

# Step 4: Verify installation
echo ""
echo "4. Verifying installation..."
INSTALLED_VERSION=$(git-mem --version 2>/dev/null || echo "unknown")
echo "   Installed version: $INSTALLED_VERSION"
echo "   git-mem: $(which git-mem)"
echo "   git-mem-mcp: $(which git-mem-mcp)"

echo ""
echo "=== Done ==="
echo ""
echo "git-mem $INSTALLED_VERSION installed globally from local build."
