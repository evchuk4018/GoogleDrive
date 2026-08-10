import type { Readable } from "node:stream";

export type UUID = string;
export type ObjectKey = string;
export type ETag = string;
export type ItemKind = "folder" | "file";

export type UploadSource =
  | Uint8Array
  | AsyncIterable<Uint8Array | string>
  | Readable
  | ReadableStream<Uint8Array>;

export interface ItemBase {
  id: UUID;
  parentId: UUID | null;
  name: string;
  kind: ItemKind;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Entity tag used for conditional metadata and content mutations. */
  etag: ETag;
  revision: number;
}

export interface FolderItem extends ItemBase {
  kind: "folder";
}

export interface FileItem extends ItemBase {
  kind: "file";
  objectKey: ObjectKey;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  /** ETag emitted by the filesystem object; unlike etag it tracks bytes only. */
  contentEtag: ETag;
}

export type DriveItem = FolderItem | FileItem;

export interface PageRequest {
  limit?: number;
  cursor?: string;
  includeTrashed?: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SearchRequest extends PageRequest {
  query: string;
}

export interface CreateFolderRecord {
  id: UUID;
  parentId: UUID | null;
  name: string;
  etag: ETag;
}

export interface CreateFileRecord {
  id: UUID;
  parentId: UUID | null;
  name: string;
  objectKey: ObjectKey;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  contentEtag: ETag;
  etag: ETag;
}

export interface ReplaceFileRecord {
  id: UUID;
  objectKey: ObjectKey;
  sizeBytes: number;
  contentType: string;
  sha256: string;
  contentEtag: ETag;
  etag: ETag;
  expectedEtag?: ETag;
}

export interface MutationOptions {
  expectedEtag?: ETag;
}

export interface ListChildrenRequest extends PageRequest {
  parentId: UUID | null;
}

export interface SearchItemsRequest extends SearchRequest {}

/** Compatibility error for the existing HTTP helpers; new code uses domain errors.ts. */
export class DriveError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DriveError";
    this.code = code;
    this.status = status;
  }
}

export function validateName(value: unknown): string {
  if (typeof value !== "string") throw new DriveError("INVALID_NAME", "Name must be a string", 422);
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.length > 255) {
    throw new DriveError("INVALID_NAME", "Name must be 1-255 characters and cannot be . or ..", 422);
  }
  if (/[\\/\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new DriveError("INVALID_NAME", "Name contains an invalid path character", 422);
  }
  return normalized;
}

export function validateUuid(value: unknown, field = "id"): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new DriveError("INVALID_ID", `${field} must be a UUID`, 422);
  }
  return value.toLowerCase();
}
