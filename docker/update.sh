#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)
"$script_dir/guard-storage.sh"
cd "$repo_root"
"$script_dir/compose.sh" build --pull web
"$script_dir/compose.sh" up -d postgres
"$script_dir/compose.sh" run --rm web node scripts/migrate.mjs
"$script_dir/compose.sh" up -d web
"$script_dir/compose.sh" ps
