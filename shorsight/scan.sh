#!/usr/bin/env bash
# Scan the committed state of this repository with ShorSight.
#
#   shorsight/scan.sh            # → shorsight/cbom.raw.json
#
# then publish, sign and rebuild the page /cbom embeds:
#
#   node scripts/sign-cbom.mjs shorsight/cbom.raw.json
#   ~/.local/share/pipx/venvs/shorsight/bin/python shorsight/build_inventory.py
#
# The scan runs on a fresh clone of HEAD, not on the working tree:
# - the clone directory is named beyond-shor, which becomes the source label —
#   the asset key in governance.beyond-shor.json has to match it
# - its origin points at GitHub, so the CBOM records the web URL and the commit
#   and every finding deep-links to its line (push the commit before publishing)
# - ignored and untracked files (node_modules, .next, "Infos für dich") stay out
# - the generated artifacts are removed first: ShorSight imports CBOM files it
#   finds, so the published inventory would otherwise scan itself, and the
#   embedded UI's own fetch calls would show up as network sinks of this site
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHORSIGHT="${SHORSIGHT:-$HOME/.local/bin/shorsight}"
WEB_URL="https://github.com/BeyondShor/beyond-shor.git"

if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]]; then
  echo "uncommitted changes — commit first, the CBOM records the commit it scanned" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git clone --quiet --no-local "$ROOT" "$TMP/beyond-shor"
git -C "$TMP/beyond-shor" remote set-url origin "$WEB_URL"
rm -rf "$TMP/beyond-shor/frontend/public/cbom.json" \
       "$TMP/beyond-shor/frontend/public/cbom.sig" \
       "$TMP/beyond-shor/frontend/public/shorsight" \
       "$TMP/beyond-shor/shorsight/cbom.raw.json"

"$SHORSIGHT" scan "$TMP/beyond-shor" --assess --validate --no-progress \
  -o "$ROOT/shorsight/cbom.raw.json"
