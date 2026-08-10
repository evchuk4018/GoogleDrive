import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

import {
  ConflictError,
  DuplicateNameError,
  NotFoundError,
  ValidationError,
} from "../domain/errors";
import { decodePageCursor, encodePageCursor } from "../domain/pagination";
import type { DriveRepository, ReplaceFileResult } from "../domain/repository";
import type {
  CreateFileRecord,
  CreateFolderRecord,
  DriveItem,
  FileItem,
  FolderItem,
  ListChildrenRequest,
  Page,
  ReplaceFileRecord,
  SearchDirection,
  SearchItemsRequest,
  SearchSort,
  UUID,
} from "../domain/types";
import {
  assertETag,
  assertObjectKey,
  assertSha256,
  assertUuid,
  isIfMatchSatisfied,
  itemNameKey,
  normalizeContentType,
  normalizeItemName,
} from "../domain/validation";

export interface DriveItemRow extends QueryResultRow {
  id: string;
  parent_id: string | null;
  kind: "folder" | "file";
  name: string;
  etag: string;
  revision: number | string;
  starred: boolean;
  trashed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  object_key: string | null;
  size_bytes: number | string | null;
  content_type: string | null;
  sha256: string | null;
  content_etag: string | null;
  sort_key?: string;
  previous_object_key?: string;
}

const ITEM_COLUMNS = `
  id,
  parent_id,
  kind,
  name,
  etag,
  revision,
  starred,
  trashed_at,
  created_at,
  updated_at,
  object_key,
  size_bytes,
  content_type,
  sha256,
  content_etag
`;

type SearchSqlParts = {
  expression: string;
  outputExpression: string;
  cursorType: "text" | "timestamptz" | "bigint";
};

function searchSqlParts(sort: SearchSort): SearchSqlParts {
  switch (sort) {
    case "updatedAt":
      return { expression: "updated_at", outputExpression: "updated_at::text", cursorType: "timestamptz" };
    case "size":
      return { expression: "COALESCE(size_bytes, -1::bigint)", outputExpression: "COALESCE(size_bytes, -1::bigint)::text", cursorType: "bigint" };
    case "kind":
      return { expression: "kind::text", outputExpression: "kind::text", cursorType: "text" };
    case "name":
    default:
      return { expression: "lower(name)", outputExpression: "lower(name)", cursorType: "text" };
  }
}

export function buildSearchSql(sort: SearchSort = "name", direction: SearchDirection = "asc"): string {
  if (sort !== "name" && sort !== "updatedAt" && sort !== "size" && sort !== "kind") {
    throw new ValidationError("Search sort is invalid");
  }
  if (direction !== "asc" && direction !== "desc") {
    throw new ValidationError("Search direction is invalid");
  }
  const parts = searchSqlParts(sort);
  const orderDirection = direction === "desc" ? "DESC" : "ASC";
  const cursorOperator = direction === "desc" ? "<" : ">";
  return `
    SELECT ${ITEM_COLUMNS}, ${parts.outputExpression} AS sort_key
    FROM drive_items
    WHERE ($1::boolean OR trashed_at IS NULL)
      AND id <> '00000000-0000-4000-8000-000000000001'::uuid
      AND (
        $2::text = ''
        OR lower(name) LIKE '%' || lower($2::text) || '%' ESCAPE '\\'
      )
      AND ($3::boolean IS NULL OR starred = $3::boolean)
      AND ($4::text IS NULL OR kind::text = $4::text)
      AND (NOT $5::boolean OR parent_id IS NOT DISTINCT FROM $6::uuid)
      AND ($7::timestamptz IS NULL OR updated_at >= $7::timestamptz)
      AND ($8::timestamptz IS NULL OR updated_at <= $8::timestamptz)
      AND (
        $9::text IS NULL
        OR (${parts.expression} ${cursorOperator} $9::${parts.cursorType}
          OR (${parts.expression} = $9::${parts.cursorType} AND id ${cursorOperator} $10::uuid))
      )
    ORDER BY ${parts.expression} ${orderDirection}, id ${orderDirection}
    LIMIT $11::integer
  `;
}

export const DRIVE_SQL = {
  findById: `
    SELECT ${ITEM_COLUMNS}
    FROM drive_items
    WHERE id = $1::uuid
      AND ($2::boolean OR trashed_at IS NULL)
  `,
  findChildByName: `
    SELECT ${ITEM_COLUMNS}
    FROM drive_items
    WHERE parent_id IS NOT DISTINCT FROM $1::uuid
      AND lower(name) = lower($2::text)
      AND ($3::boolean OR trashed_at IS NULL)
    ORDER BY id
    LIMIT 1
  `,
  listChildren: `
    SELECT ${ITEM_COLUMNS}, lower(name) AS sort_key
    FROM drive_items
    WHERE parent_id IS NOT DISTINCT FROM $1::uuid
      AND id <> '00000000-0000-4000-8000-000000000001'::uuid
      AND ($2::boolean OR trashed_at IS NULL)
      AND (
        $3::text IS NULL
        OR (lower(name), id) > ($3::text, $4::uuid)
      )
    ORDER BY lower(name), id
    LIMIT $5::integer
  `,
  search: buildSearchSql(),
  isDescendant: `
    WITH RECURSIVE descendants AS (
      SELECT id
      FROM drive_items
      WHERE id = $1::uuid
      UNION ALL
      SELECT child.id
      FROM drive_items child
      JOIN descendants parent ON child.parent_id = parent.id
    )
    SELECT EXISTS (SELECT 1 FROM descendants WHERE id = $2::uuid) AS is_descendant
  `,
  insertFolder: `
    INSERT INTO drive_items (id, parent_id, kind, name, etag)
    VALUES ($1::uuid, $2::uuid, 'folder', $3::text, $4::text)
    RETURNING ${ITEM_COLUMNS}
  `,
  insertRootFolder: `
    INSERT INTO drive_items (id, parent_id, kind, name, etag)
    VALUES ($1::uuid, NULL, 'folder', $2::text, $3::text)
    ON CONFLICT (id) DO NOTHING
  `,
  insertFile: `
    INSERT INTO drive_items (
      id, parent_id, kind, name, etag, object_key, size_bytes,
      content_type, sha256, content_etag
    )
    VALUES ($1::uuid, $2::uuid, 'file', $3::text, $4::text, $5::uuid,
      $6::bigint, $7::text, $8::char(64), $9::text)
    RETURNING ${ITEM_COLUMNS}
  `,
  renameItem: `
    UPDATE drive_items
    SET name = $2::text,
        etag = $4::text,
        revision = revision + 1,
        updated_at = now()
    WHERE id = $1::uuid
      AND trashed_at IS NULL
      AND ($3::text IS NULL OR $3::text = '*' OR etag = $3::text)
    RETURNING ${ITEM_COLUMNS}
  `,
  moveItem: `
    UPDATE drive_items
    SET parent_id = $2::uuid,
        etag = $4::text,
        revision = revision + 1,
        updated_at = now()
    WHERE id = $1::uuid
      AND trashed_at IS NULL
      AND ($3::text IS NULL OR $3::text = '*' OR etag = $3::text)
    RETURNING ${ITEM_COLUMNS}
  `,
  setStarred: `
    UPDATE drive_items
    SET starred = $2::boolean,
        etag = $4::text,
        revision = revision + 1,
        updated_at = now()
    WHERE id = $1::uuid
      AND trashed_at IS NULL
      AND ($3::text IS NULL OR $3::text = '*' OR etag = $3::text)
    RETURNING ${ITEM_COLUMNS}
  `,
  replaceFile: `
    WITH current_item AS (
      SELECT object_key AS previous_object_key
      FROM drive_items
      WHERE id = $1::uuid
        AND kind = 'file'
        AND trashed_at IS NULL
        AND ($8::text IS NULL OR $8::text = '*' OR etag = $8::text)
    )
    UPDATE drive_items AS item
    SET object_key = $2::uuid,
        size_bytes = $3::bigint,
        content_type = $4::text,
        sha256 = $5::char(64),
        content_etag = $6::text,
        etag = $7::text,
        revision = revision + 1,
        updated_at = now()
    FROM current_item
    WHERE item.id = $1::uuid
    RETURNING current_item.previous_object_key, item.*
  `,
  trashSubtree: `
    WITH RECURSIVE subtree AS (
      SELECT id
      FROM drive_items
      WHERE id = $1::uuid
      UNION ALL
      SELECT child.id
      FROM drive_items child
      JOIN subtree parent ON child.parent_id = parent.id
    ), root AS (
      SELECT id
      FROM drive_items
      WHERE id = $1::uuid
        AND trashed_at IS NULL
        AND ($2::text IS NULL OR $2::text = '*' OR etag = $2::text)
    )
    UPDATE drive_items AS item
    SET trashed_at = now(),
        etag = '"' || md5(random()::text || clock_timestamp()::text || item.id::text) || '"',
        revision = revision + 1,
        updated_at = now()
    WHERE item.id IN (SELECT id FROM subtree)
      AND EXISTS (SELECT 1 FROM root)
    RETURNING item.*
  `,
  restoreConflicts: `
    WITH RECURSIVE subtree AS (
      SELECT id, parent_id, name, trashed_at
      FROM drive_items
      WHERE id = $1::uuid
      UNION ALL
      SELECT child.id, child.parent_id, child.name, child.trashed_at
      FROM drive_items child
      JOIN subtree parent ON child.parent_id = parent.id
    )
    SELECT target.id, target.parent_id, target.name
    FROM subtree target
    JOIN drive_items sibling
      ON sibling.parent_id IS NOT DISTINCT FROM target.parent_id
     AND lower(sibling.name) = lower(target.name)
     AND sibling.trashed_at IS NULL
     AND sibling.id <> target.id
     AND NOT EXISTS (SELECT 1 FROM subtree nested WHERE nested.id = sibling.id)
    WHERE target.trashed_at IS NOT NULL
    LIMIT 1
  `,
  restoreSubtree: `
    WITH RECURSIVE subtree AS (
      SELECT id
      FROM drive_items
      WHERE id = $1::uuid
      UNION ALL
      SELECT child.id
      FROM drive_items child
      JOIN subtree parent ON child.parent_id = parent.id
    )
    UPDATE drive_items AS item
    SET trashed_at = NULL,
        etag = '"' || md5(random()::text || clock_timestamp()::text || item.id::text) || '"',
        revision = revision + 1,
        updated_at = now()
    WHERE item.id IN (SELECT id FROM subtree)
    RETURNING item.*
  `,
  permanentlyDeleteSubtree: `
    WITH RECURSIVE subtree AS (
      SELECT id
      FROM drive_items
      WHERE id = $1::uuid
        AND ($2::text IS NULL OR $2::text = '*' OR etag = $2::text)
      UNION ALL
      SELECT child.id
      FROM drive_items child
      JOIN subtree parent ON child.parent_id = parent.id
    )
    DELETE FROM drive_items AS item
    USING subtree
    WHERE item.id = subtree.id
    RETURNING item.*
  `,
} as const;

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function toDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid database timestamp in ${field}`);
  return date;
}

function toSafeNumber(value: number | string | null, field: string): number | null {
  if (value === null) return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`Invalid database number in ${field}`);
  return number;
}

export function mapDriveItemRow(row: DriveItemRow): DriveItem {
  const id = assertUuid(row.id, "item.id");
  const parentId = row.parent_id === null ? null : assertUuid(row.parent_id, "item.parent_id");
  const name = normalizeItemName(row.name);
  const etag = assertETag(row.etag, "item.etag");
  const revision = toSafeNumber(row.revision, "item.revision");
  if (revision === null || revision < 1) throw new Error("Invalid database revision");
  const base = {
    id,
    parentId,
    name,
    kind: row.kind,
    trashedAt: row.trashed_at === null ? null : toDate(row.trashed_at, "trashed_at"),
    createdAt: toDate(row.created_at, "created_at"),
    updatedAt: toDate(row.updated_at, "updated_at"),
    etag,
    revision,
    starred: row.starred === true,
  } as const;

  if (row.kind === "folder") {
    return base as FolderItem;
  }
  if (row.kind !== "file") throw new Error(`Unknown database item kind: ${String(row.kind)}`);
  if (row.object_key === null || row.size_bytes === null || row.content_type === null || row.sha256 === null || row.content_etag === null) {
    throw new Error(`File ${id} is missing storage metadata`);
  }
  const sizeBytes = toSafeNumber(row.size_bytes, "size_bytes");
  if (sizeBytes === null) throw new Error("File size is required");
  return {
    ...base,
    kind: "file",
    objectKey: assertObjectKey(row.object_key),
    sizeBytes,
    contentType: normalizeContentType(row.content_type),
    sha256: assertSha256(row.sha256),
    contentEtag: assertETag(row.content_etag, "content_etag"),
  } satisfies FileItem;
}

function pageFromRows(rows: DriveItemRow[], limit: number): Page<DriveItem> {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  const last = selected[selected.length - 1];
  return {
    items: selected.map(mapDriveItemRow),
    nextCursor: hasMore && last ? encodePageCursor({ sortKey: last.sort_key ?? itemNameKey(last.name), id: last.id }) : null,
  };
}

export class PostgresDriveRepository implements DriveRepository {
  private readonly pool: Pool;
  private readonly client?: PoolClient;

  constructor(pool: Pool, client?: PoolClient) {
    this.pool = pool;
    this.client = client;
  }

  private async query<T extends QueryResultRow = DriveItemRow>(
    sql: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const executor = this.client ?? this.pool;
    return executor.query<T>(sql, values);
  }

  private async mutationCurrent(id: UUID, expectedEtag?: string): Promise<DriveItem> {
    const item = await this.findById(id, { includeTrashed: true });
    if (!item) throw new NotFoundError(id);
    if (item.trashedAt !== null) throw new NotFoundError(id);
    if (!isIfMatchSatisfied(item.etag, expectedEtag)) {
      throw new ConflictError(id, expectedEtag, item.etag);
    }
    return item;
  }

  private async duplicateSafe<T>(
    operation: () => Promise<T>,
    name: string,
    parentId: UUID | null,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (errorCode(error) === "23505") throw new DuplicateNameError(name, parentId);
      throw error;
    }
  }

  async findById(id: UUID, options: { includeTrashed?: boolean } = {}): Promise<DriveItem | null> {
    const normalizedId = assertUuid(id);
    const result = await this.query<DriveItemRow>(DRIVE_SQL.findById, [
      normalizedId,
      options.includeTrashed ?? true,
    ]);
    return result.rows[0] ? mapDriveItemRow(result.rows[0]) : null;
  }

  async findChildByName(
    parentId: UUID | null,
    name: string,
    options: { includeTrashed?: boolean } = {},
  ): Promise<DriveItem | null> {
    const normalizedParentId = parentId === null ? null : assertUuid(parentId, "parentId");
    const normalizedName = normalizeItemName(name);
    const result = await this.query<DriveItemRow>(DRIVE_SQL.findChildByName, [
      normalizedParentId,
      normalizedName,
      options.includeTrashed ?? false,
    ]);
    return result.rows[0] ? mapDriveItemRow(result.rows[0]) : null;
  }

  async listChildren(request: ListChildrenRequest): Promise<Page<DriveItem>> {
    const parentId = request.parentId === null ? null : assertUuid(request.parentId, "parentId");
    const limit = request.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1000) {
      throw new ValidationError("Repository page limit must be between 1 and 1000");
    }
    const cursor = decodePageCursor(request.cursor);
    const result = await this.query<DriveItemRow>(DRIVE_SQL.listChildren, [
      parentId,
      request.includeTrashed ?? false,
      cursor?.sortKey ?? null,
      cursor?.id ?? null,
      limit + 1,
    ]);
    return pageFromRows(result.rows, limit);
  }

  async search(request: SearchItemsRequest): Promise<Page<DriveItem>> {
    const query = request.query.trim();
    if (query.length > 256) throw new ValidationError("Search query is too long");
    const likeQuery = query.replace(/[\\%_]/g, (character) => `\\${character}`);
    const limit = request.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 1000) {
      throw new ValidationError("Repository page limit must be between 1 and 1000");
    }
    const cursor = decodePageCursor(request.cursor);
    const sort = request.sort ?? "name";
    const direction = request.direction ?? "asc";
    const parentFilter = request.parentId !== undefined;
    const result = await this.query<DriveItemRow>(buildSearchSql(sort, direction), [
      request.includeTrashed ?? false,
      likeQuery,
      request.starred ?? null,
      request.kind ?? null,
      parentFilter,
      request.parentId ?? null,
      request.modifiedAfter?.toISOString() ?? null,
      request.modifiedBefore?.toISOString() ?? null,
      cursor?.sortKey ?? null,
      cursor?.id ?? null,
      limit + 1,
    ]);
    return pageFromRows(result.rows, limit);
  }

  async isDescendant(ancestorId: UUID, possibleDescendantId: UUID): Promise<boolean> {
    const result = await this.query<{ is_descendant: boolean }>(DRIVE_SQL.isDescendant, [
      assertUuid(ancestorId, "ancestorId"),
      assertUuid(possibleDescendantId, "possibleDescendantId"),
    ]);
    return result.rows[0]?.is_descendant === true;
  }

  async createFolder(record: CreateFolderRecord): Promise<FolderItem> {
    const normalized = {
      id: assertUuid(record.id),
      parentId: record.parentId === null ? null : assertUuid(record.parentId, "parentId"),
      name: normalizeItemName(record.name),
      etag: assertETag(record.etag),
    };
    return this.duplicateSafe(async () => {
      const result = await this.query<DriveItemRow>(DRIVE_SQL.insertFolder, [
        normalized.id,
        normalized.parentId,
        normalized.name,
        normalized.etag,
      ]);
      const item = result.rows[0] ? mapDriveItemRow(result.rows[0]) : null;
      if (!item || item.kind !== "folder") throw new Error("Folder insert returned no folder");
      return item;
    }, normalized.name, normalized.parentId);
  }

  async createFile(record: CreateFileRecord): Promise<FileItem> {
    const normalized = {
      id: assertUuid(record.id),
      parentId: record.parentId === null ? null : assertUuid(record.parentId, "parentId"),
      name: normalizeItemName(record.name),
      objectKey: assertObjectKey(record.objectKey),
      sizeBytes: toSafeNumber(record.sizeBytes, "sizeBytes"),
      contentType: normalizeContentType(record.contentType),
      sha256: assertSha256(record.sha256),
      contentEtag: assertETag(record.contentEtag, "contentEtag"),
      etag: assertETag(record.etag),
    };
    if (normalized.sizeBytes === null) throw new ValidationError("sizeBytes is required");
    return this.duplicateSafe(async () => {
      const result = await this.query<DriveItemRow>(DRIVE_SQL.insertFile, [
        normalized.id,
        normalized.parentId,
        normalized.name,
        normalized.etag,
        normalized.objectKey,
        normalized.sizeBytes,
        normalized.contentType,
        normalized.sha256,
        normalized.contentEtag,
      ]);
      const item = result.rows[0] ? mapDriveItemRow(result.rows[0]) : null;
      if (!item || item.kind !== "file") throw new Error("File insert returned no file");
      return item;
    }, normalized.name, normalized.parentId);
  }

  async renameItem(
    id: UUID,
    name: string,
    expectedEtag: string | undefined,
    newEtag: string,
  ): Promise<DriveItem> {
    const normalizedId = assertUuid(id);
    const normalizedName = normalizeItemName(name);
    const normalizedExpected = expectedEtag === undefined ? undefined : assertETag(expectedEtag, "If-Match");
    const normalizedNew = assertETag(newEtag, "newEtag");
    return this.duplicateSafe(async () => {
      const result = await this.query<DriveItemRow>(DRIVE_SQL.renameItem, [
        normalizedId,
        normalizedName,
        normalizedExpected ?? null,
        normalizedNew,
      ]);
      if (result.rows[0]) return mapDriveItemRow(result.rows[0]);
      await this.mutationCurrent(normalizedId, normalizedExpected);
      throw new ConflictError(normalizedId, normalizedExpected);
    }, normalizedName, (await this.findById(normalizedId, { includeTrashed: true }))?.parentId ?? null);
  }

  async moveItem(
    id: UUID,
    parentId: UUID | null,
    expectedEtag: string | undefined,
    newEtag: string,
  ): Promise<DriveItem> {
    const normalizedId = assertUuid(id);
    const normalizedParent = parentId === null ? null : assertUuid(parentId, "parentId");
    const normalizedExpected = expectedEtag === undefined ? undefined : assertETag(expectedEtag, "If-Match");
    const result = await this.query<DriveItemRow>(DRIVE_SQL.moveItem, [
      normalizedId,
      normalizedParent,
      normalizedExpected ?? null,
      assertETag(newEtag, "newEtag"),
    ]);
    if (result.rows[0]) return mapDriveItemRow(result.rows[0]);
    await this.mutationCurrent(normalizedId, normalizedExpected);
    throw new ConflictError(normalizedId, normalizedExpected);
  }

  async setStarred(
    id: UUID,
    starred: boolean,
    expectedEtag: string | undefined,
    newEtag: string,
  ): Promise<DriveItem> {
    const normalizedId = assertUuid(id);
    if (typeof starred !== "boolean") throw new ValidationError("starred must be a boolean");
    const normalizedExpected = expectedEtag === undefined ? undefined : assertETag(expectedEtag, "If-Match");
    const result = await this.query<DriveItemRow>(DRIVE_SQL.setStarred, [
      normalizedId,
      starred,
      normalizedExpected ?? null,
      assertETag(newEtag, "newEtag"),
    ]);
    if (result.rows[0]) return mapDriveItemRow(result.rows[0]);
    await this.mutationCurrent(normalizedId, normalizedExpected);
    throw new ConflictError(normalizedId, normalizedExpected);
  }

  async replaceFile(record: ReplaceFileRecord): Promise<ReplaceFileResult> {
    const normalized = {
      id: assertUuid(record.id),
      objectKey: assertObjectKey(record.objectKey),
      sizeBytes: toSafeNumber(record.sizeBytes, "sizeBytes"),
      contentType: normalizeContentType(record.contentType),
      sha256: assertSha256(record.sha256),
      contentEtag: assertETag(record.contentEtag, "contentEtag"),
      etag: assertETag(record.etag),
      expectedEtag: record.expectedEtag === undefined ? undefined : assertETag(record.expectedEtag, "If-Match"),
    };
    if (normalized.sizeBytes === null) throw new ValidationError("sizeBytes is required");
    const result = await this.query<DriveItemRow>(DRIVE_SQL.replaceFile, [
      normalized.id,
      normalized.objectKey,
      normalized.sizeBytes,
      normalized.contentType,
      normalized.sha256,
      normalized.contentEtag,
      normalized.etag,
      normalized.expectedEtag ?? null,
    ]);
    const row = result.rows[0];
    if (row) {
      const item = mapDriveItemRow(row);
      if (item.kind !== "file" || !row.previous_object_key) throw new Error("File replacement returned invalid data");
      return { item, previousObjectKey: assertObjectKey(row.previous_object_key) };
    }
    await this.mutationCurrent(normalized.id, normalized.expectedEtag);
    throw new ConflictError(normalized.id, normalized.expectedEtag);
  }

  async trashSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]> {
    const normalizedId = assertUuid(id);
    const expected = expectedEtag === undefined ? undefined : assertETag(expectedEtag, "If-Match");
    const result = await this.query<DriveItemRow>(DRIVE_SQL.trashSubtree, [normalizedId, expected ?? null]);
    if (result.rows.length > 0) return result.rows.map(mapDriveItemRow);
    await this.mutationCurrent(normalizedId, expected);
    throw new ConflictError(normalizedId, expected);
  }

  async restoreSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]> {
    const normalizedId = assertUuid(id);
    const expected = expectedEtag === undefined ? undefined : assertETag(expectedEtag, "If-Match");
    return this.withTransaction(async (repository) => {
      const txRepository = repository as PostgresDriveRepository;
      const current = await txRepository.findById(normalizedId, { includeTrashed: true });
      if (!current) throw new NotFoundError(normalizedId);
      if (current.trashedAt === null) throw new ValidationError("Item is not in the trash");
      if (!isIfMatchSatisfied(current.etag, expected)) {
        throw new ConflictError(normalizedId, expected, current.etag);
      }
      const conflicts = await txRepository.query<{ id: string; parent_id: string | null; name: string }>(
        DRIVE_SQL.restoreConflicts,
        [normalizedId],
      );
      const conflict = conflicts.rows[0];
      if (conflict) {
        throw new DuplicateNameError(
          normalizeItemName(conflict.name),
          conflict.parent_id === null ? null : assertUuid(conflict.parent_id, "parentId"),
        );
      }
      const result = await txRepository.query<DriveItemRow>(DRIVE_SQL.restoreSubtree, [normalizedId]);
      return result.rows.map(mapDriveItemRow);
    });
  }

  async permanentlyDeleteSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]> {
    const normalizedId = assertUuid(id);
    const expected = expectedEtag === undefined ? undefined : assertETag(expectedEtag, "If-Match");
    return this.withTransaction(async (repository) => {
      const txRepository = repository as PostgresDriveRepository;
      const current = await txRepository.findById(normalizedId, { includeTrashed: true });
      if (!current) throw new NotFoundError(normalizedId);
      if (!isIfMatchSatisfied(current.etag, expected)) {
        throw new ConflictError(normalizedId, expected, current.etag);
      }
      const result = await txRepository.query<DriveItemRow>(DRIVE_SQL.permanentlyDeleteSubtree, [
        normalizedId,
        expected ?? null,
      ]);
      if (result.rows.length === 0) throw new ConflictError(normalizedId, expected, current.etag);
      return result.rows.map(mapDriveItemRow);
    });
  }

  async withTransaction<T>(work: (repository: DriveRepository) => Promise<T>): Promise<T> {
    if (this.client) return work(this);
    const client = await this.pool.connect();
    await client.query("BEGIN");
    const repository = new PostgresDriveRepository(this.pool, client);
    try {
      const result = await work(repository);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createPostgresDriveRepository(pool: Pool): PostgresDriveRepository {
  return new PostgresDriveRepository(pool);
}
