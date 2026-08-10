#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this storage bootstrap as root (for example: sudo ./docker/bootstrap-storage.sh)" >&2
  exit 1
fi

storage_root=/srv/storage
drive_root=/srv/storage/googledrive
owner_user=${DRIVE_OWNER_USER:-${SUDO_USER:-}}
owner_group=${DRIVE_OWNER_GROUP:-${owner_user:-}}

if [[ ! -d "$storage_root" ]] || ! mountpoint -q "$storage_root"; then
  echo "Refusing to initialize: $storage_root is not a mounted filesystem" >&2
  exit 1
fi
if [[ -L "$storage_root" || -L "$drive_root" ]]; then
  echo "Refusing to initialize a symlink storage path" >&2
  exit 1
fi
if [[ -z "$owner_user" || -z "$owner_group" ]]; then
  echo "Set DRIVE_OWNER_USER and DRIVE_OWNER_GROUP to the unprivileged Compose owner" >&2
  exit 1
fi
if ! id "$owner_user" >/dev/null 2>&1; then
  echo "Unknown storage owner: $owner_user" >&2
  exit 1
fi

install -d -o "$owner_user" -g "$owner_group" -m 0750 "$drive_root" "$drive_root/app" "$drive_root/files" "$drive_root/postgres"
if [[ "$(stat -c '%U:%G' "$drive_root")" != "$owner_user:$owner_group" ]]; then
  echo "Storage ownership verification failed" >&2
  exit 1
fi
echo "Initialized $drive_root for $owner_user:$owner_group"
