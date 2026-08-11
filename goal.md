<proposed_plan>
# Local Google Drive Clone with Wowzer Bowser MCP Integration

## Summary

Build a standalone Next.js/TypeScript service in `C:\Users\erhol\GoogleDrive` with:

- PostgreSQL metadata storage.
- Atomic local-disk file storage under `/srv/storage/googledrive`.
- Basic file-browser UI.
- REST API with OpenAPI documentation.
- Streamable HTTP MCP endpoint for Wowzer Bowser.

Wowzer already supports remote MCP servers, so no Wowzer code changes should be required.

## Implementation Changes

- Scaffold the app with Docker Compose, Node 22, PostgreSQL, migrations, health checks, and a guarded deployment script.
- Bind both PostgreSQL data and file objects to `/srv/storage/googledrive`, verifying `/srv/storage` is the mounted hard drive before startup.
- Add domain services, repositories, and a local filesystem adapter with:
  - UUID-based object keys.
  - Atomic temporary-file uploads.
  - SHA-256 hashes and ETags.
  - Path traversal and symlink protection.
  - Configurable upload limits.
- Add hierarchical folders, filename search, rename, move, trash, restore, recursive permanent deletion, and duplicate-name protection.
- Use conditional overwrites: stale `If-Match`/ETag writes return `409` without changing the newer file.
- Add REST endpoints for listing/search, folder creation, streaming upload/download, metadata, rename/move, trash, restore, and permanent deletion.
- Add `/openapi.json` and curl examples to the README.
- Add a minimal UI with breadcrumbs, folder navigation, upload, create-folder, rename, move, search, trash, restore, and delete actions.
- Leave REST and MCP authentication to the private network boundary rather than enforcing application login or tokens.

### MCP interface

Expose `POST /mcp`, supporting `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`, returning JSON-RPC responses with `structuredContent`.

Agent-facing tools:

- `drive_list`
- `drive_search`
- `drive_get_metadata`
- `drive_read_text`
- `drive_write_file`
- `drive_create_folder`
- `drive_rename_item`
- `drive_move_item`
- `drive_trash_item`
- `drive_restore_item`
- `drive_delete_permanently`

Read tools return bounded metadata or UTF-8 text. Small text/base64 writes are supported through MCP; large binary transfers use the REST upload/download endpoints. Tool names and descriptions will preserve Wowzer’s read/write/destructive approval classification.

Expose the service externally through the existing private Tailscale Serve endpoint:

```text
https://homelab.tail861ffd.ts.net/drive/mcp
```

The existing Wowzer route at `/` must remain unchanged.

## Test and Acceptance Criteria

- Unit tests for object-key safety, atomic writes, hashes, ETags, upload limits, duplicate names, folder validation, recursive trash/restore, and permanent deletion.
- API tests for folder/file lifecycle, streaming bytes, search, pagination, ETag conflicts, and safe error responses.
- MCP tests for initialization, tool discovery, tool calls, malformed JSON-RPC, and structured results.
- UI/render tests without browser or screenshot verification.
- Compose smoke tests verifying:
  - Database migrations apply cleanly.
  - Health reports ready.
  - User data mounts are under `/srv/storage/googledrive`.
  - No database or application port is publicly exposed.
  - Startup refuses an unmounted or unsafe storage path.
- Deployment verification:
  - `https://homelab.tail861ffd.ts.net/api/health`
  - `https://homelab.tail861ffd.ts.net/drive/mcp`
  - Wowzer Settings → Connectors → Add MCP Server discovers the tools.
  - Wowzer can list, read, create, move, and trash files with expected approvals.

## Assumptions and Defaults

- V1 is single-owner only; no sharing links, multi-user accounts, previews, revisions, or Google OAuth.
- Folder deletion is soft-delete of the entire subtree; restore is atomic and fails if names conflict.
- Permanent deletion removes both metadata and binary content.
- Default MCP text reads are bounded to 256 KiB; MCP binary writes are bounded separately from REST uploads.
- Deployment uses a dedicated Compose stack and hard-drive-backed bind mounts, with migrations applied and health verified before completion.
- The relevant Wowzer instructions were found in `C:\Users\erhol\wowzerbowser\AGENTS.md`; `agents.mds` was not present in the GoogleDrive checkout.
</proposed_plan>
