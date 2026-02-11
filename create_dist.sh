#!/usr/bin/env bash
# Build the self-contained dist/ hook pack and bump version.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Bump patch version in package.json (e.g. 0.1.0 -> 0.1.1)
VERSION="$(node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const parts = (p.version || '0.0.0').split('.').map(Number);
parts[2] = (parts[2] || 0) + 1;
p.version = parts.join('.');
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
console.log(p.version);
")"
echo "[create_dist] Version set to: $VERSION"

# Clean and recreate dist
DIST_DIR="$REPO_ROOT/dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Copy only files that belong in the distributable hook pack
cp package.json "$DIST_DIR/"
cp LICENSE "$DIST_DIR/"
cp CHANGELOG.md "$DIST_DIR/"
cp -r hooks "$DIST_DIR/"
cp -r src "$DIST_DIR/"
cp scripts/install-session-labeler.sh "$DIST_DIR/"
chmod +x "$DIST_DIR/install-session-labeler.sh"
cp scripts/README.dist.md "$DIST_DIR/README.md"
[[ -d scripts/skill-stub ]] && cp -r scripts/skill-stub "$DIST_DIR/"

# Write versioning info for dist
echo "$VERSION" > "$DIST_DIR/VERSION"
echo "Built: $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> "$DIST_DIR/VERSION"

echo "[create_dist] Packed $DIST_DIR (version $VERSION)"
