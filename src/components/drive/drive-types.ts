export type DriveItemKind = 'file' | 'folder';

export interface DriveItem {
  id: string;
  name: string;
  kind: DriveItemKind;
  mimeType: string | null;
  size: number | null;
  updatedAt: string | null;
  parentId: string | null;
  starred: boolean;
  trashed: boolean;
}

export interface DriveBreadcrumb {
  id: string | null;
  name: string;
}

export interface DriveApiErrorShape {
  message?: string;
  error?: string | { message?: string };
  detail?: string;
}

export type DriveView = 'drive' | 'trash';

export type DriveSearchSort = 'name' | 'updatedAt' | 'modified' | 'size' | 'kind' | 'type';
export type DriveSearchDirection = 'asc' | 'desc';

export interface DriveSearchOptions {
  cursor?: string;
  limit?: number;
  includeTrash?: boolean;
  starred?: boolean;
  kind?: DriveItemKind;
  parentId?: string | null;
  location?: string | null;
  modifiedAfter?: string | Date;
  modifiedBefore?: string | Date;
  sort?: DriveSearchSort;
  direction?: DriveSearchDirection;
}

export interface DriveItemChanges {
  name?: string;
  parentId?: string | null;
  starred?: boolean;
}

export interface DriveListOptions {
  cursor?: string;
  limit?: number;
}
