#!/usr/bin/env bash
# spegla.sh <målmapp>: lägger integrationen och speglingens filer i en utcheckning av jesperhardyson/sopor-home-assistant.
# Allt utom .git ersätts, så att filer som tagits bort här också försvinner i speglingen.
set -euo pipefail

MAL="${1:?Användning: spegla.sh <målmapp>}"
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"

find "$MAL" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
mkdir -p "$MAL/custom_components"
cp -R "$REPO/custom_components/sopor" "$MAL/custom_components/sopor"
find "$MAL/custom_components" -name __pycache__ -type d -prune -exec rm -rf {} +
cp "$REPO/hacs.json" "$REPO/LICENSE" "$MAL/"
cp -R "$REPO/integrations/home-assistant/spegel/." "$MAL/"
