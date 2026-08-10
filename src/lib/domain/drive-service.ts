import { TextDecoder } from "node:util";

import { getDriveConfig, ROOT_FOLDER_ID } from "@/lib/config/app-config";
import { ConflictError, InvalidParentError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import { newUuid, makeEntityTag, normalizeContentType, normalizeItemName, assertSearchQuery, assertUuid } from "@/lib/domain/validation";
import type { DriveItem, FileItem, FolderItem, Page, SearchItemsOptions, UUID } from "@/lib/domain/types";
import { getDb } from "@/lib/persistence/db";
import { createPostgresDriveRepository } from "@/lib/persistence/drive-repository";
import type { DriveRepository } from "@/lib/domain/repository";
import { LocalFilesystemStorage } from "@/lib/storage/local-filesystem";

function rootAsNull(id: string | null | undefined): UUID | null {
  if (id === null || id === undefined || id === "") return null;
  if (id.toLowerCase() === ROOT_FOLDER_ID || id.toLowerCase() === "root") return null;
  return assertUuid(id, "parentId");
}

function activeFolder(item: DriveItem | null, id: UUID | null): FolderItem {
  if (!item || item.kind !== "folder" || item.trashedAt !== null) throw new InvalidParentError(id ?? "root");
  return item;
}

export type UploadInput = {
  parentId?: string | null;
  name: string;
  mimeType?: string;
  body: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
  overwriteId?: string;
  ifMatch?: string;
  maxBytes?: number;
};

export type DriveSearchOptions = SearchItemsOptions & {
  limit?: number;
  cursor?: string;
  includeTrash?: boolean;
};

export type DriveItemChanges = {
  name?: string;
  parentId?: string | null;
  starred?: boolean;
};

function normalizedSearchDate(value: Date | undefined, field: string): Date | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ValidationError(`${field} must be a valid date`);
  }
  return new Date(value.getTime());
}

export class DriveService {
  private readonly repository: DriveRepository;
  private readonly storage: LocalFilesystemStorage;

  constructor(repository = createPostgresDriveRepository(getDb()), storage = new LocalFilesystemStorage(getDriveConfig().storageRoot, {
    maxUploadBytes: getDriveConfig().maxUploadBytes,
    allowedRootDir: getDriveConfig().storageRoot.startsWith("/srv/storage/") ? "/srv/storage" : undefined,
  })) {
    this.repository = repository;
    this.storage = storage;
  }

  async initialize(): Promise<void> {
    await this.storage.ensureRoot();
    const existing = await this.repository.findById(ROOT_FOLDER_ID, { includeTrashed: true });
    if (!existing) {
      await this.repository.createFolder({ id: ROOT_FOLDER_ID, parentId: null, name: "My Drive", etag: makeEntityTag() });
    }
  }

  async list(parentId?: string | null, options: { limit?: number; cursor?: string; includeTrash?: boolean } = {}): Promise<Page<DriveItem>> {
    const normalizedParent = rootAsNull(parentId);
    if (normalizedParent !== null) activeFolder(await this.repository.findById(normalizedParent), normalizedParent);
    return this.repository.listChildren({ parentId: normalizedParent, limit: options.limit ?? 50, cursor: options.cursor, includeTrashed: options.includeTrash ?? false });
  }

  async search(query: string, options: DriveSearchOptions = {}): Promise<Page<DriveItem>> {
    const value = assertSearchQuery(query);
    const modifiedAfter = normalizedSearchDate(options.modifiedAfter, "modifiedAfter");
    const modifiedBefore = normalizedSearchDate(options.modifiedBefore, "modifiedBefore");
    if (modifiedAfter && modifiedBefore && modifiedAfter > modifiedBefore) {
      throw new ValidationError("modifiedAfter must be before modifiedBefore");
    }
    const hasCriteria = value.length > 0 || options.includeTrash !== undefined || options.starred !== undefined ||
      options.kind !== undefined || options.parentId !== undefined || modifiedAfter !== undefined ||
      modifiedBefore !== undefined || options.sort !== undefined || options.direction !== undefined;
    if (!hasCriteria) throw new ValidationError("Search query cannot be empty");
    const parentId = options.parentId === undefined ? undefined : rootAsNull(options.parentId);
    return this.repository.search({
      query: value,
      limit: options.limit ?? 50,
      cursor: options.cursor,
      includeTrashed: options.includeTrash ?? false,
      starred: options.starred,
      kind: options.kind,
      parentId,
      modifiedAfter,
      modifiedBefore,
      sort: options.sort,
      direction: options.direction,
    });
  }

  async metadata(id: string): Promise<DriveItem> {
    const normalized = id.toLowerCase() === ROOT_FOLDER_ID ? ROOT_FOLDER_ID : assertUuid(id);
    const item = await this.repository.findById(normalized, { includeTrashed: true });
    if (!item) throw new NotFoundError(normalized);
    return item;
  }

  async createFolder(name: string, parentId?: string | null): Promise<FolderItem> {
    const normalizedParent = rootAsNull(parentId);
    if (normalizedParent !== null) activeFolder(await this.repository.findById(normalizedParent), normalizedParent);
    return this.repository.createFolder({ id: newUuid(), parentId: normalizedParent, name: normalizeItemName(name), etag: makeEntityTag() });
  }

  async upload(input: UploadInput): Promise<FileItem> {
    const parentId = rootAsNull(input.parentId);
    if (parentId !== null) activeFolder(await this.repository.findById(parentId), parentId);
    const name = normalizeItemName(input.name);
    const contentType = normalizeContentType(input.mimeType);
    const stored = await this.storage.put(input.body, { maxBytes: input.maxBytes ?? getDriveConfig().maxUploadBytes });
    try {
      if (input.overwriteId) {
        const replaced = await this.repository.replaceFile({
          id: assertUuid(input.overwriteId), objectKey: stored.objectKey, sizeBytes: stored.sizeBytes,
          contentType, sha256: stored.sha256, contentEtag: stored.etag, etag: makeEntityTag(), expectedEtag: input.ifMatch,
        });
        await this.storage.delete(replaced.previousObjectKey);
        return replaced.item;
      }
      return await this.repository.createFile({
        id: newUuid(), parentId, name, objectKey: stored.objectKey, sizeBytes: stored.sizeBytes,
        contentType, sha256: stored.sha256, contentEtag: stored.etag, etag: makeEntityTag(),
      });
    } catch (error) {
      await this.storage.delete(stored.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async download(id: string): Promise<{ item: FileItem; stream: NodeJS.ReadableStream }> {
    const item = await this.metadata(id);
    if (item.kind !== "file" || item.trashedAt !== null) throw new NotFoundError(id);
    return { item, stream: await this.storage.openRead(item.objectKey) };
  }

  async readText(id: string, maxBytes = getDriveConfig().maxMcpReadBytes): Promise<{ item: FileItem; text: string }> {
    const item = await this.metadata(id);
    if (item.kind !== "file" || item.trashedAt !== null) throw new NotFoundError(id);
    if (item.sizeBytes > maxBytes) throw new ValidationError(`File exceeds the ${maxBytes}-byte MCP read limit`);
    const bytes = await this.storage.read(item.objectKey);
    try { return { item, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }; }
    catch { throw new ValidationError("File is not valid UTF-8 text"); }
  }

  async update(id: string, changes: DriveItemChanges, ifMatch?: string): Promise<DriveItem> {
    const normalizedId = assertUuid(id);
    let current = await this.metadata(normalizedId);
    if (normalizedId === ROOT_FOLDER_ID) throw new ConflictError(normalizedId, ifMatch, current.etag);
    let expectedEtag = ifMatch;
    if (changes.name !== undefined) {
      current = await this.repository.renameItem(normalizedId, normalizeItemName(changes.name), expectedEtag, makeEntityTag());
      expectedEtag = current.etag;
    }
    if (changes.parentId !== undefined) {
      const parentId = rootAsNull(changes.parentId);
      if (parentId !== null) activeFolder(await this.repository.findById(parentId), parentId);
      if (parentId === normalizedId || (parentId !== null && await this.repository.isDescendant(normalizedId, parentId))) {
        throw new ValidationError("An item cannot be moved inside itself");
      }
      current = await this.repository.moveItem(normalizedId, parentId, expectedEtag, makeEntityTag());
      expectedEtag = current.etag;
    }
    if (changes.starred !== undefined) {
      if (typeof changes.starred !== "boolean") throw new ValidationError("starred must be a boolean");
      if (changes.starred !== current.starred) {
        current = await this.repository.setStarred(normalizedId, changes.starred, expectedEtag, makeEntityTag());
      }
    }
    return current;
  }

  async trash(id: string, ifMatch?: string): Promise<DriveItem[]> {
    const normalized = assertUuid(id);
    if (normalized === ROOT_FOLDER_ID) throw new ConflictError(normalized, ifMatch);
    return this.repository.trashSubtree(normalized, ifMatch);
  }

  async restore(id: string, ifMatch?: string): Promise<DriveItem[]> {
    const normalized = assertUuid(id);
    if (normalized === ROOT_FOLDER_ID) throw new ConflictError(normalized, ifMatch);
    return this.repository.restoreSubtree(normalized, ifMatch);
  }

  async deletePermanently(id: string, ifMatch?: string): Promise<void> {
    const normalized = assertUuid(id);
    if (normalized === ROOT_FOLDER_ID) throw new ConflictError(normalized, ifMatch);
    const removed = await this.repository.permanentlyDeleteSubtree(normalized, ifMatch);
    await Promise.all(removed.filter((item): item is FileItem => item.kind === "file").map((item) => this.storage.delete(item.objectKey)));
  }
}

let service: DriveService | undefined;
export function getDriveService(): DriveService {
  return service ??= new DriveService();
}

export function resetDriveServiceForTests(): void { service = undefined; }
