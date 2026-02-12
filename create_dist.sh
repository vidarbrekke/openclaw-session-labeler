#!/usr/bin/env bash
# Build the self-contained dist/ hook pack and bump version.
#
# Output (dist/) contains only runtime assets — no node_modules, no source .ts.
# Contents: package.json, LICENSE, CHANGELOG.md, install-session-labeler.sh,
# README.md (from scripts/README.dist.md), VERSION, skill-stub/, hooks/session-labeler/
# (handler.js + HOOK.md), src/ (compiled .js from build/).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Build first: compile handler + src to build/ (avoids runtime .ts / missing module errors)
echo "[create_dist] Building (tsc)..."
npm run build
[[ -d build ]] || { echo "[create_dist] ERROR: build/ not found after tsc"; exit 1; }

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
mkdir -p "$DIST_DIR/hooks/session-labeler"

# Copy compiled JS (handler + src) so runtime imports resolve
for f in build/hooks/session-labeler/*.js; do
  [[ -e "$f" ]] && cp "$f" "$DIST_DIR/hooks/session-labeler/"
done
cp -r build/src "$DIST_DIR/"
# HOOK.md is not compiled; copy from source
cp hooks/session-labeler/HOOK.md "$DIST_DIR/hooks/session-labeler/"

# Copy metadata and scripts
cp package.json "$DIST_DIR/"
node -e "
const fs = require('fs');
const p = '$DIST_DIR/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
// Dist pack is runtime-only; drop repo/dev scripts that reference missing files.
delete pkg.scripts;
delete pkg.devDependencies;
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
"
cp LICENSE "$DIST_DIR/"
cp CHANGELOG.md "$DIST_DIR/"
cp scripts/install-session-labeler.sh "$DIST_DIR/"
chmod +x "$DIST_DIR/install-session-labeler.sh"
cp scripts/README.dist.md "$DIST_DIR/README.md"
[[ -d scripts/skill-stub ]] && cp -r scripts/skill-stub "$DIST_DIR/"

# Remove macOS archive metadata if present
find "$DIST_DIR" -name ".DS_Store" -delete
find "$DIST_DIR" -name "__MACOSX" -prune -exec rm -rf {} +

# Write versioning info for dist
echo "$VERSION" > "$DIST_DIR/VERSION"
echo "Built: $(date -u '+%Y-%m-%d %H:%M:%S UTC')" >> "$DIST_DIR/VERSION"

echo "[create_dist] Packed $DIST_DIR (version $VERSION, compiled JS)"
