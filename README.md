# Local Google Drive

A single-owner, self-hosted file browser and MCP server. Metadata lives in PostgreSQL; file bytes live on the mounted hard drive under `/srv/storage/googledrive/files`.

## Quick start

1. Copy `.env.example` to `.env` and set a long random `DRIVE_API_TOKEN` and `POSTGRES_PASSWORD`.
2. Run `docker/compose.sh up -d --build` on the Linux host. The storage guard refuses to start unless `/srv/storage` is mounted and `/srv/storage/googledrive` is a real directory beneath it.
3. Check `http://127.0.0.1:3080/api/health`, then open the browser through the private Tailscale URL.

The application container applies pending migrations before starting. Database and application ports are not publicly published: PostgreSQL is private to Compose and the web service binds only to `127.0.0.1:3080`.

The production image sets `NEXT_PUBLIC_DRIVE_BASE_PATH=/drive` so browser assets, navigation, and API calls stay under the Tailscale Serve mount. Leave it empty for direct local development at `/`.

## Share files from a phone

Drive is installable as a PWA and registers as a multi-file system share target. While connected to the private Tailscale network:

1. Open the Drive URL in Chrome on Android, sign in, and use the browser menu to install or add Drive to the home screen.
2. From Photos or Files, select one or more items, tap Share, and choose Drive.
3. Drive uploads the shared files to the My Drive root and reports any partial failures.

Sharing requires an active network connection and an existing Drive session. The share target is primarily supported by Android Chromium browsers; it does not provide an offline upload queue.

## API

REST and MCP requests use `Authorization: Bearer $DRIVE_API_TOKEN`. The browser login accepts the same token and exchanges it for a short-lived HttpOnly session cookie.

The complete machine-readable contract is at `/openapi.json`.

List the root folder:

```bash
curl -H "Authorization: Bearer $DRIVE_API_TOKEN" \
  https://homelab.tail861ffd.ts.net/drive/api/drive/items
```

Create a folder and upload a file:

```bash
curl -X POST -H "Authorization: Bearer $DRIVE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Projects"}' \
  https://homelab.tail861ffd.ts.net/drive/api/drive/folders

curl -X POST -H "Authorization: Bearer $DRIVE_API_TOKEN" \
  -H 'X-Filename: hello.txt' -H 'Content-Type: text/plain' \
  --data-binary @hello.txt \
  https://homelab.tail861ffd.ts.net/drive/api/drive/upload
```

Use `X-Parent-Id` for a folder, `X-Overwrite-Id` plus `If-Match` for a conditional overwrite, and the `download`, `trash`, `restore`, and `permanent` item routes for the corresponding lifecycle operations. Stale ETags return `409` and never replace newer content.

## MCP

The streamable HTTP endpoint is `/drive/mcp` when served through the private Tailscale route, or `/mcp` when accessed directly. It supports `initialize`, `notifications/initialized`, `tools/list`, and `tools/call` with structured results for:

`drive_list`, `drive_search`, `drive_get_metadata`, `drive_read_text`, `drive_write_file`, `drive_create_folder`, `drive_rename_item`, `drive_move_item`, `drive_trash_item`, `drive_restore_item`, and `drive_delete_permanently`.

MCP text reads are bounded by `DRIVE_MCP_MAX_READ_BYTES`; MCP writes are bounded by `DRIVE_MAX_MCP_WRITE_BYTES`. Large binary transfers use the authenticated REST upload/download routes. Tool descriptions mark read-only, write, and destructive actions for Wowzer approval handling.

Example initialization:

```bash
curl -X POST https://homelab.tail861ffd.ts.net/drive/mcp \
  -H "Authorization: Bearer $DRIVE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

For local non-Compose development, provide `DATABASE_URL`, `DRIVE_API_TOKEN`, and a writable `DRIVE_STORAGE_ROOT`. `npm run db:migrate` applies SQL files in `migrations/`; `npm run db:check` reports applied versions.

The test suite covers validation, safe object keys, atomic writes, hashes and ETags, upload limits, duplicate names, subtree trash/restore/permanent deletion, conditional conflicts, auth/session behavior, MCP discovery and parse errors, and the UI action contract. UI verification is intentionally render/source based; no browser or screenshot automation is required.

## Homelab deployment

The dedicated stack is intended to live at `/srv/storage/googledrive/app`. On a fresh host, initialize the hard-drive-backed directories once as root, choosing the unprivileged account that runs Docker:

```bash
sudo DRIVE_OWNER_USER=evanh DRIVE_OWNER_GROUP=evanh ./docker/bootstrap-storage.sh
```

Set `/srv/storage/googledrive/deployment.env` with `POSTGRES_PASSWORD`, `DATABASE_URL=postgres://googledrive:<password>@postgres:5432/googledrive`, and `DRIVE_API_TOKEN`, then run `docker/update.sh` from the checkout. It guards the mount, builds the image, applies migrations, starts the stack, and reports container health.

After the stack is healthy, add the private path while preserving Wowzer's existing root Serve route:

```bash
tailscale serve --bg --set-path /drive http://127.0.0.1:3080
tailscale serve status
```

The expected private checks are:

```bash
curl -fsS https://homelab.tail861ffd.ts.net/drive/api/health
curl -fsS -H "Authorization: Bearer $DRIVE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  https://homelab.tail861ffd.ts.net/drive/mcp
```
