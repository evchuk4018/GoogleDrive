import { ValidationError } from "./errors";
import { assertUuid } from "./validation";
import type { UUID } from "./types";

export interface PageCursor {
  sortKey: string;
  id: UUID;
}

export function encodePageCursor(cursor: PageCursor): string {
  assertUuid(cursor.id, "cursor.id");
  if (!cursor.sortKey || cursor.sortKey.length > 512) {
    throw new ValidationError("Cursor sort key is invalid");
  }
  return Buffer.from(JSON.stringify({ sortKey: cursor.sortKey, id: cursor.id })).toString("base64url");
}

export function decodePageCursor(value: string | undefined): PageCursor | null {
  if (!value) return null;
  if (value.length > 2048) throw new ValidationError("Cursor is too long");

  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object") throw new Error("not an object");
    const record = decoded as Record<string, unknown>;
    if (typeof record.sortKey !== "string" || !record.sortKey || record.sortKey.length > 512) {
      throw new Error("invalid sort key");
    }
    return { sortKey: record.sortKey, id: assertUuid(record.id, "cursor.id") };
  } catch {
    throw new ValidationError("Cursor is invalid");
  }
}
