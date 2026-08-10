import type { Readable } from "node:stream";

import type { ObjectKey, UploadSource } from "./types";

export interface StoredObject {
  objectKey: ObjectKey;
  sizeBytes: number;
  sha256: string;
  etag: string;
}

export interface ObjectStorage {
  put(source: UploadSource, options?: { objectKey?: ObjectKey; maxBytes?: number }): Promise<StoredObject>;
  openRead(objectKey: ObjectKey): Promise<Readable>;
  delete(objectKey: ObjectKey): Promise<void>;
  exists(objectKey: ObjectKey): Promise<boolean>;
}
