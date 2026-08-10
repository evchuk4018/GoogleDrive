import type {
  CreateFileRecord,
  CreateFolderRecord,
  DriveItem,
  ListChildrenRequest,
  Page,
  ReplaceFileRecord,
  SearchItemsRequest,
  UUID,
} from "./types";

export interface ReplaceFileResult {
  item: Extract<DriveItem, { kind: "file" }>;
  previousObjectKey: string;
}

export interface DriveRepository {
  findById(id: UUID, options?: { includeTrashed?: boolean }): Promise<DriveItem | null>;
  findChildByName(
    parentId: UUID | null,
    name: string,
    options?: { includeTrashed?: boolean },
  ): Promise<DriveItem | null>;
  listChildren(request: ListChildrenRequest): Promise<Page<DriveItem>>;
  search(request: SearchItemsRequest): Promise<Page<DriveItem>>;

  /** Returns true when possibleDescendantId is below ancestorId. */
  isDescendant(ancestorId: UUID, possibleDescendantId: UUID): Promise<boolean>;

  createFolder(record: CreateFolderRecord): Promise<Extract<DriveItem, { kind: "folder" }>>;
  createFile(record: CreateFileRecord): Promise<Extract<DriveItem, { kind: "file" }>>;
  renameItem(
    id: UUID,
    name: string,
    expectedEtag: string | undefined,
    newEtag: string,
  ): Promise<DriveItem>;
  moveItem(
    id: UUID,
    parentId: UUID | null,
    expectedEtag: string | undefined,
    newEtag: string,
  ): Promise<DriveItem>;
  replaceFile(record: ReplaceFileRecord): Promise<ReplaceFileResult>;
  trashSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]>;
  restoreSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]>;
  permanentlyDeleteSubtree(id: UUID, expectedEtag?: string): Promise<DriveItem[]>;

  withTransaction<T>(work: (repository: DriveRepository) => Promise<T>): Promise<T>;
}
