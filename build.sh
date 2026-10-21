#!/usr/bin/env bash
# Concatenates the ordered source parts into the single deliverable death-race.html.
set -euo pipefail
cd "$(dirname "$0")"
OUT=death-race.html
shopt -s nullglob
parts=(src/[0-9][0-9]_*)
{ for p in "${parts[@]}"; do cat "$p"; printf '\n'; done; } > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
# Syntax-check the module script with Node's parser (ES module grammar, imports not resolved).
awk '/<script type="module">/{f=1;next} /<\/script>/{f=0} f' "$OUT" > .module-check.mjs
node --check .module-check.mjs
rm -f .module-check.mjs
echo "built $OUT ($(wc -c < "$OUT") bytes) from ${#parts[@]} parts"
