#!/usr/bin/env bash
# Package each skill in skills/ into a single-file .skill bundle (zip archive)
# under deck-kit/dist/, ready to upload via Claude Desktop's Settings → Skills.
# Run after editing any file under skills/.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d skills ]]; then
  echo "skills/ not found (expected to run from deck-kit/scripts/)" >&2
  exit 1
fi

OUT_DIR="dist"
mkdir -p "$OUT_DIR"

pack_one() {
  local name="$1"
  if [[ ! -f "skills/$name/SKILL.md" ]]; then
    echo "  skip $name (no SKILL.md)"
    return
  fi
  local out="$OUT_DIR/$name.skill"
  rm -f "$out"
  ( cd skills && zip -r -q "../$out" "$name" \
      -x "$name/node_modules/*" \
      -x "$name/.DS_Store" \
      -x "$name/test/*" \
      -x "$name/package-lock.json" )
  local size
  size=$(ls -lh "$out" | awk '{print $5}')
  echo "  wrote $size  $out"
}

echo "Packing skills into $OUT_DIR/ ..."
for skill_dir in skills/*/; do
  pack_one "$(basename "$skill_dir")"
done
echo "Done."
