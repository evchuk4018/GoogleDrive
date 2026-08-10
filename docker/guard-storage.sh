#!/usr/bin/env bash
set -euo pipefail

storage_root=/srv/storage
drive_root=/srv/storage/googledrive

if [[ ! -d "$storage_root" ]] || ! mountpoint -q "$storage_root"; then
  echo "Refusing to start: $storage_root is not a mounted filesystem" >&2
  exit 1
fi

if [[ -L "$storage_root" || -L "$drive_root" ]]; then
  echo "Refusing to start: storage path must not be a symlink" >&2
  exit 1
fi

mkdir -p "$drive_root/postgres" "$drive_root/files"
resolved_root=$(realpath -e "$storage_root")
resolved_drive=$(realpath -e "$drive_root")
case "$resolved_drive/" in
  "$resolved_root"/*) ;;
  *) echo "Refusing to start: drive path escaped /srv/storage" >&2; exit 1 ;;
esac

echo "Storage guard passed: $resolved_drive"
