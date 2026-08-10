import { Readable } from "node:stream";

import { getDriveConfig } from "../config/app-config";
import { LocalFilesystemStorage } from "./local-filesystem";

/** Legacy spelling retained for the existing health/download helpers. */
export type StoredObject = {
  objectKey: string;
  size: number;
  sha256: string;
  etag: string;
};

export class LocalFileStore {
  private readonly storage: LocalFilesystemStorage;

  constructor(root = getDriveConfig().DRIVE_STORAGE_ROOT) {
    this.storage = new LocalFilesystemStorage({
      rootDir: root,
      maxUploadBytes: getDriveConfig().DRIVE_MAX_UPLOAD_BYTES,
    });
  }

  ensureRoot(): Promise<void> {
    return this.storage.ensureRoot();
  }

  async write(
    source: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
    maxBytes = getDriveConfig().DRIVE_MAX_UPLOAD_BYTES,
  ): Promise<StoredObject> {
    const stored = await this.storage.put(source, { maxBytes });
    return {
      objectKey: stored.objectKey,
      size: stored.sizeBytes,
      sha256: stored.sha256,
      etag: stored.etag,
    };
  }

  read(objectKey: string): Promise<Readable> {
    return this.storage.openRead(objectKey);
  }

  async readBounded(objectKey: string, maxBytes: number): Promise<Buffer> {
    const stream = await this.storage.openRead(objectKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxBytes) throw new Error(`File exceeds ${maxBytes} bytes`);
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  remove(objectKey: string): Promise<void> {
    return this.storage.delete(objectKey);
  }
}
