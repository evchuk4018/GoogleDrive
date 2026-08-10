import type { DriveItem, Page } from "@/lib/domain/types";

export type ApiDriveItem = {
  id: string;
  parentId: string | null;
  kind: "folder" | "file";
  name: string;
  etag: string;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
  trashedAt: string | null;
  size: number | null;
  mimeType: string | null;
  sha256: string | null;
  sizeBytes?: number;
  contentType?: string;
  contentEtag?: string;
  revision: number;
};

export function serializeItem(item: DriveItem): ApiDriveItem {
  if (item.kind === "folder") return {
    id: item.id, parentId: item.parentId, kind: item.kind, name: item.name, etag: item.etag,
    createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    starred: item.starred,
    trashedAt: item.trashedAt?.toISOString() ?? null, size: null, mimeType: null, sha256: null, revision: item.revision,
  };
  return {
    id: item.id, parentId: item.parentId, kind: item.kind, name: item.name, etag: item.etag,
    createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    starred: item.starred,
    trashedAt: item.trashedAt?.toISOString() ?? null, size: item.sizeBytes, mimeType: item.contentType,
    sha256: item.sha256, sizeBytes: item.sizeBytes, contentType: item.contentType,
    contentEtag: item.contentEtag, revision: item.revision,
  };
}

export function serializePage(page: Page<DriveItem>) {
  return { items: page.items.map(serializeItem), nextCursor: page.nextCursor };
}

export function serializeItems(items: DriveItem[]) { return items.map(serializeItem); }
