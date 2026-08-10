import crypto from "node:crypto";

import { ConflictError, DuplicateNameError, NotFoundError, ValidationError } from "../../../src/lib/domain/errors";
import { decodePageCursor, encodePageCursor } from "../../../src/lib/domain/pagination";
import type { DriveRepository, ReplaceFileResult } from "../../../src/lib/domain/repository";
import type {
  CreateFileRecord,
  CreateFolderRecord,
  DriveItem,
  FileItem,
  FolderItem,
  ListChildrenRequest,
  Page,
  ReplaceFileRecord,
  SearchItemsRequest,
  UUID,
} from "../../../src/lib/domain/types";
import { assertUuid, isIfMatchSatisfied, itemNameKey, makeEntityTag, normalizeItemName } from "../../../src/lib/domain/validation";

function cloneItem(item: DriveItem): DriveItem {
  return {
    ...item,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
    trashedAt: item.trashedAt ? new Date(item.trashedAt) : null,
  } as DriveItem;
}

function sorted(items: DriveItem[]): DriveItem[] {
  return [...items].sort((left, right) => {
    const name = itemNameKey(left.name).localeCompare(itemNameKey(right.name));
    return name || left.id.localeCompare(right.id);
  });
}

export class MemoryDriveRepository implements DriveRepository {
  readonly items = new Map<UUID, DriveItem>();

  seedFolder(parentId: UUID | null, name: string, id = crypto.randomUUID()): FolderItem {
    const now = new Date();
    const folder: FolderItem = {
      id,
      parentId,
      name: normalizeItemName(name),
      kind: "folder",
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
      etag: makeEntityTag(),
      revision: 1,
    };
    this.items.set(id, folder);
    return cloneItem(folder) as FolderItem;
  }

  async findById(id: UUID, options: { includeTrashed?: boolean } = {}): Promise<DriveItem | null> {
    const item = this.items.get(assertUuid(id));
    if (!item || (options.includeTrashed === false && item.trashedAt !== null)) return null;
    return cloneItem(item);
  }

  async findChildByName(parentId: UUID | null, name: string, options: { includeTrashed?: boolean } = {}): Promise<DriveItem | null> {
    const key = itemNameKey(name);
    const item = [...this.items.values()].find(
      (candidate) =>
        candidate.parentId === parentId &&
        itemNameKey(candidate.name) === key &&
        (options.includeTrashed === true || candidate.trashedAt === null),
    );
    return item ? cloneItem(item) : null;
  }

  async listChildren(request: ListChildrenRequest): Promise<Page<DriveItem>> {
    const limit = request.limit ?? 50;
    const cursor = decodePageCursor(request.cursor);
    let candidates = sorted(
      [...this.items.values()].filter(
        (item) => item.parentId === request.parentId && (request.includeTrashed === true || item.trashedAt === null),
      ),
    );
    if (cursor) {
      candidates = candidates.filter(
        (item) => itemNameKey(item.name) > cursor.sortKey || (itemNameKey(item.name) === cursor.sortKey && item.id > cursor.id),
      );
    }
    const page = candidates.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const items = page.slice(0, limit).map(cloneItem);
    return {
      items,
      nextCursor: hasMore && items.length > 0 ? encodePageCursor({ sortKey: itemNameKey(items.at(-1)!.name), id: items.at(-1)!.id }) : null,
    };
  }

  async search(request: SearchItemsRequest): Promise<Page<DriveItem>> {
    const query = request.query.toLocaleLowerCase("en-US");
    const cursor = decodePageCursor(request.cursor);
    let candidates = sorted(
      [...this.items.values()].filter(
        (item) => itemNameKey(item.name).includes(query) && (request.includeTrashed === true || item.trashedAt === null),
      ),
    );
    if (cursor) {
      candidates = candidates.filter(
        (item) => itemNameKey(item.name) > cursor.sortKey || (itemNameKey(item.name) === cursor.sortKey && item.id > cursor.id),
      );
    }
    const page = candidates.slice(0, (request.limit ?? 50) + 1);
    const limit = request.limit ?? 50;
    const items = page.slice(0, limit).map(cloneItem);
    return {
      items,
      nextCursor: page.length > limit && items.length > 0 ? encodePageCursor({ sortKey: itemNameKey(items.at(-1)!.name), id: items.at(-1)!.id }) : null,
    };
  }

  async isDescendant(ancestorId: UUID, possibleDescendantId: UUID): Promise<boolean> {
    let current = this.items.get(assertUuid(possibleDescendantId));
    const ancestor = assertUuid(ancestorId);
    while (current?.parentId !== null && current?.parentId !== undefined) {
      if (current.parentId === ancestor) return true;
      current = this.items.get(current.parentId);
    }
    return false;
  }

  async createFolder(record: CreateFolderRecord): Promise<FolderItem> {
    this.assertAvailableName(record.parentId, record.name);
    const now = new Date();
    const item: FolderItem = {
      id: assertUuid(record.id),
      parentId: record.parentId,
      name: normalizeItemName(record.name),
      kind: "folder",
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
      etag: record.etag,
      revision: 1,
    };
    this.items.set(item.id, item);
    return cloneItem(item) as FolderItem;
  }

  async createFile(record: CreateFileRecord): Promise<FileItem> {
    this.assertAvailableName(record.parentId, record.name);
    const now = new Date();
    const item: FileItem = {
      id: assertUuid(record.id),
      parentId: record.parentId,
      name: normalizeItemName(record.name),
      kind: "file",
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
      etag: record.etag,
      revision: 1,
      objectKey: record.objectKey,
      sizeBytes: record.sizeBytes,
      contentType: record.contentType,
      sha256: record.sha256,
      contentEtag: record.contentEtag,
    };
    this.items.set(item.id, item);
    return cloneItem(item) as FileItem;
  }

  async renameItem(id: UUID, name: string, expectedEtag: string | undefined, newEtag: string): Promise<DriveItem> {
    const item = this.requireActive(id);
    this.assertExpected(item, expectedEtag);
    this.assertAvailableName(item.parentId, name, item.id);
    item.name = normalizeItemName(name);
    item.etag = newEtag;
    item.revision += 1;
    item.updatedAt = new Date();
    return cloneItem(item);
  }

  async moveItem(id: UUID, parentId: UUID | null, expectedEtag: string | undefined, newEtag: string): Promise<DriveItem> {
    const item = this.requireActive(id);
    this.assertExpected(item, expectedEtag);
    this.assertAvailableName(parentId, item.name, item.id);
    item.parentId = parentId;
    item.etag = newEtag;
    item.revision += 1;
    item.updatedAt = new Date();
    return cloneItem(item);
  }

  async replaceFile(record: ReplaceFileRecord): Promise<ReplaceFileResult> {
    const item = this.requireActive(record.id);
    if (item.kind !== "file") throw new ValidationError("Only files can be replaced");
    this.assertExpected(item, record.expectedEtag);
    const previousObjectKey = item.objectKey;
    item.objectKey = record.objectKey;
    item.sizeBytes = record.sizeBytes;
    item.contentType = record.contentType;
    item.sha256 = record.sha256;
    item.contentEtag = record.contentEtag;
    item.etag = record.etag;
    item.revision += 1;
    item.updatedAt = new Date();
    return { item: cloneItem(item) as FileItem, previousObjectKey };
  }

  async trashSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]> {
    const root = this.requireActive(id);
    this.assertExpected(root, expectedEtag);
    const now = new Date();
    const changed = this.subtree(root.id).map((item) => {
      item.trashedAt = now;
      item.etag = makeEntityTag();
      item.revision += 1;
      item.updatedAt = now;
      return cloneItem(item);
    });
    return changed;
  }

  async restoreSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]> {
    const root = this.items.get(assertUuid(id));
    if (!root) throw new NotFoundError(id);
    if (root.trashedAt === null) throw new ValidationError("Item is not in the trash");
    this.assertExpected(root, expectedEtag);
    const subtree = this.subtree(root.id);
    for (const item of subtree) {
      const conflict = [...this.items.values()].find(
        (candidate) =>
          candidate.id !== item.id &&
          !subtree.some((nested) => nested.id === candidate.id) &&
          candidate.parentId === item.parentId &&
          candidate.trashedAt === null &&
          itemNameKey(candidate.name) === itemNameKey(item.name),
      );
      if (conflict) throw new DuplicateNameError(item.name, item.parentId);
    }
    const now = new Date();
    return subtree.map((item) => {
      item.trashedAt = null;
      item.etag = makeEntityTag();
      item.revision += 1;
      item.updatedAt = now;
      return cloneItem(item);
    });
  }

  async permanentlyDeleteSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]> {
    const root = this.items.get(assertUuid(id));
    if (!root) throw new NotFoundError(id);
    this.assertExpected(root, expectedEtag);
    const subtree = this.subtree(root.id).map(cloneItem);
    for (const item of subtree) this.items.delete(item.id);
    return subtree;
  }

  async withTransaction<T>(work: (repository: DriveRepository) => Promise<T>): Promise<T> {
    return work(this);
  }

  private requireActive(id: UUID): DriveItem {
    const item = this.items.get(assertUuid(id));
    if (!item || item.trashedAt !== null) throw new NotFoundError(id);
    return item;
  }

  private assertExpected(item: DriveItem, expectedEtag: string | undefined): void {
    if (!isIfMatchSatisfied(item.etag, expectedEtag)) throw new ConflictError(item.id, expectedEtag, item.etag);
  }

  private assertAvailableName(parentId: UUID | null, name: string, excludedId?: UUID): void {
    const normalized = itemNameKey(name);
    const duplicate = [...this.items.values()].find(
      (item) => item.id !== excludedId && item.parentId === parentId && item.trashedAt === null && itemNameKey(item.name) === normalized,
    );
    if (duplicate) throw new DuplicateNameError(name, parentId);
  }

  private subtree(rootId: UUID): DriveItem[] {
    const result: DriveItem[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const item = this.items.get(id);
      if (!item) continue;
      result.push(item);
      for (const child of this.items.values()) if (child.parentId === id) queue.push(child.id);
    }
    return result;
  }
}
