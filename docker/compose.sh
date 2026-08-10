#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
"$script_dir/guard-storage.sh"
cd "$repo_root"
if [[ -f /srv/storage/googledrive/deployment.env ]]; then
  exec docker compose --env-file /srv/storage/googledrive/deployment.env "$@"
fi
exec docker compose "$@"
