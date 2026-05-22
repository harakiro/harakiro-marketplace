#!/usr/bin/env bash
# Repack skills/deck-publish/ into deck-publish.skill and deck-publish.zip
# at the repo root. Run after editing any file under skills/deck-publish/.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d skills/deck-publish ]]; then
  echo "skills/deck-publish/ not found" >&2
  exit 1
fi

rm -f deck-publish.skill deck-publish.zip

(cd skills && zip -r -q ../../deck-publish.skill deck-publish \
  -x '*/node_modules/*' \
  -x '*/.DS_Store' \
  -x '*/test/*' \
  -x '*/package-lock.json')

cp deck-publish.skill deck-publish.zip

echo "wrote $(ls -lh deck-publish.skill | awk '{print $5}') deck-publish.skill"
echo "wrote $(ls -lh deck-publish.zip   | awk '{print $5}') deck-publish.zip"
