import crypto from "node:crypto";

import { ValidationError } from "./errors";
import type { ETag, ObjectKey, UUID } from "./types";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
export const MAX_ITEM_NAME_LENGTH = 255;
export const MAX_CONTENT_TYPE_LENGTH = 255;

export function isUuid(value: unknown): value is UUID {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function assertUuid(value: unknown, field = "id"): UUID {
  if (!isUuid(value)) throw new ValidationError(`${field} must be a UUID`);
  return value.toLowerCase();
}

export function optionalUuid(value: unknown, field: string): UUID | null {
  if (value === null || value === undefined) return null;
  return assertUuid(value, field);
}

export function newUuid(): UUID {
  return crypto.randomUUID();
}

/**
 * Names are stored as one path component. Keeping separators and control
 * characters out of the domain makes both SQL and filesystem adapters safer.
 */
export function normalizeItemName(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Item name must be a string");
  const name = value.trim();
  if (!name) throw new ValidationError("Item name must not be empty");
  if (name === "." || name === "..") throw new ValidationError("Item name cannot be . or ..");
  if (name.length > MAX_ITEM_NAME_LENGTH) {
    throw new ValidationError(`Item name must be at most ${MAX_ITEM_NAME_LENGTH} characters`);
  }
  if (/[\\/\u0000-\u001f\u007f]/u.test(name)) {
    throw new ValidationError("Item name contains a path separator or control character");
  }
  return name;
}

/** Sibling uniqueness is intentionally case-insensitive. */
export function itemNameKey(name: string): string {
  return normalizeItemName(name).toLocaleLowerCase("en-US");
}

export function normalizeContentType(value: unknown): string {
  if (value === undefined || value === null || value === "") return "application/octet-stream";
  if (typeof value !== "string") throw new ValidationError("Content type must be a string");
  const contentType = value.trim();
  if (!contentType || contentType.length > MAX_CONTENT_TYPE_LENGTH) {
    throw new ValidationError("Content type is invalid");
  }
  if (/[^\x20-\x7e]/u.test(contentType) || /[\r\n]/u.test(contentType)) {
    throw new ValidationError("Content type contains invalid characters");
  }
  return contentType;
}

export function assertObjectKey(value: unknown): ObjectKey {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ValidationError("Object key must be a canonical UUID");
  }
  return value.toLowerCase();
}

export function assertSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new ValidationError("SHA-256 hash must be 64 hexadecimal characters");
  }
  return value.toLowerCase();
}

export function assertETag(value: unknown, field = "ETag"): ETag {
  if (typeof value !== "string" || value.length < 3 || value.length > 512) {
    throw new ValidationError(`${field} is invalid`);
  }
  if (/[\r\n]/u.test(value)) throw new ValidationError(`${field} contains invalid characters`);
  return value;
}

export function assertNonNegativeSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ValidationError(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

export function assertPositivePageLimit(
  value: unknown,
  defaultLimit: number,
  maxLimit: number,
): number {
  const limit = value === undefined ? defaultLimit : value;
  if (!Number.isSafeInteger(limit) || (limit as number) <= 0 || (limit as number) > maxLimit) {
    throw new ValidationError(`Page limit must be an integer between 1 and ${maxLimit}`);
  }
  return limit as number;
}

export function assertSearchQuery(value: unknown, maxLength = 256): string {
  if (typeof value !== "string") throw new ValidationError("Search query must be a string");
  const query = value.trim();
  if (query.length > maxLength) {
    throw new ValidationError(`Search query must be at most ${maxLength} characters`);
  }
  if (/\u0000/u.test(query)) throw new ValidationError("Search query contains a null character");
  return query;
}

export function makeEntityTag(): ETag {
  return `"${crypto.randomUUID()}"`;
}

export function isIfMatchSatisfied(itemEtag: ETag, expectedEtag: ETag | undefined): boolean {
  return expectedEtag === undefined || expectedEtag === "*" || expectedEtag === itemEtag;
}
