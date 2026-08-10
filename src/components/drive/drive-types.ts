export type DriveItemKind = 'file' | 'folder';

export interface DriveItem {
  id: string;
  name: string;
  kind: DriveItemKind;
  mimeType: string | null;
  size: number | null;
  updatedAt: string | null;
  parentId: string | null;
  trashed: boolean;
}

export interface DriveBreadcrumb {
  id: string | null;
  name: string;
}

export interface DriveApiErrorShape {
  message?: string;
  error?: string;
  detail?: string;
}

export type DriveView = 'drive' | 'trash';
