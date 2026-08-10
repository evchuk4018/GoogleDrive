#!/usr/bin/env bash
set -euo pipefail

if [[ "${DRIVE_STORAGE_ROOT:-}" != /srv/storage/googledrive/files ]]; then
  echo "Refusing to start: DRIVE_STORAGE_ROOT must be /srv/storage/googledrive/files in Compose" >&2
  exit 1
fi

node scripts/migrate.mjs

if (($# > 0)); then
  exec "$@"
fi

export HOSTNAME="${DRIVE_BIND_HOST:-0.0.0.0}"
exec node server.js
