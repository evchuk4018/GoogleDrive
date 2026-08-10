import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";

import { StorageSafetyError, UploadLimitError, ValidationError } from "../domain/errors";
import type { ObjectStorage, StoredObject } from "../domain/object-storage";
import type { ObjectKey, UploadSource } from "../domain/types";
import { assertObjectKey, assertNonNegativeSafeInteger, newUuid } from "../domain/validation";

export const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

export interface LocalFilesystemStorageOptions {
  rootDir: string;
  maxUploadBytes?: number;
  /** Optional mount boundary, useful for production storage-root guards. */
  allowedRootDir?: string;
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertSafeRootPath(rootDir: string, allowedRootDir?: string): string {
  if (!path.isAbsolute(rootDir)) {
    throw new StorageSafetyError("Storage root must be an absolute path");
  }
  const resolvedRoot = path.resolve(rootDir);
  if (resolvedRoot === path.parse(resolvedRoot).root) {
    throw new StorageSafetyError("The filesystem root cannot be used as Drive storage");
  }

  if (allowedRootDir !== undefined) {
    if (!path.isAbsolute(allowedRootDir)) {
      throw new StorageSafetyError("Allowed storage root must be an absolute path");
    }
    const resolvedAllowedRoot = path.resolve(allowedRootDir);
    if (!isPathInside(resolvedAllowedRoot, resolvedRoot)) {
      throw new StorageSafetyError("Storage root must be inside the allowed storage mount");
    }
  }
  return resolvedRoot;
}

function asBuffer(chunk: Uint8Array | string): Buffer {
  return typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
}

async function* chunks(source: UploadSource): AsyncGenerator<Buffer> {
  if (source instanceof Uint8Array) {
    yield Buffer.from(source);
    return;
  }

  if (source instanceof ReadableStream) {
    const reader = source.getReader();
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) return;
        if (result.value !== undefined) yield Buffer.from(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  if (source && typeof (source as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function") {
    for await (const chunk of source as AsyncIterable<Uint8Array | string>) {
      yield asBuffer(chunk);
    }
    return;
  }

  throw new ValidationError("Upload source must be bytes or an async iterable of bytes");
}

function etagForSha256(sha256: string): string {
  return `"${sha256}"`;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function closeQuietly(handle: FileHandle | undefined): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // The original upload error is more useful to callers.
  }
}

async function unlinkQuietly(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

export class LocalFilesystemStorage implements ObjectStorage {
  readonly rootDir: string;
  readonly maxUploadBytes: number;
  readonly allowedRootDir?: string;

  constructor(rootDir: string, options?: Omit<LocalFilesystemStorageOptions, "rootDir">);
  constructor(options: LocalFilesystemStorageOptions);
  constructor(
    rootOrOptions: string | LocalFilesystemStorageOptions,
    options: Omit<LocalFilesystemStorageOptions, "rootDir"> = {},
  ) {
    const configured =
      typeof rootOrOptions === "string" ? { rootDir: rootOrOptions, ...options } : rootOrOptions;
    this.rootDir = assertSafeRootPath(configured.rootDir, configured.allowedRootDir);
    this.allowedRootDir = configured.allowedRootDir
      ? path.resolve(configured.allowedRootDir)
      : undefined;
    this.maxUploadBytes = configured.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
    assertNonNegativeSafeInteger(this.maxUploadBytes, "maxUploadBytes");
    if (this.maxUploadBytes <= 0) throw new ValidationError("maxUploadBytes must be positive");
  }

  /** Validates the root on every operation, including symlink replacement races. */
  async ensureRoot(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(this.rootDir);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new StorageSafetyError("Storage root must be a real directory, not a symlink");
    }

    const actualRoot = await realpath(this.rootDir);
    if (actualRoot !== this.rootDir) {
      throw new StorageSafetyError("Storage root resolves through a symlink");
    }

    const allowedRootDir = this.allowedRootDir;
    if (allowedRootDir) {
      const actualAllowedRoot = await realpath(allowedRootDir).catch(() => allowedRootDir);
      if (!isPathInside(actualAllowedRoot, actualRoot)) {
        throw new StorageSafetyError("Storage root escaped the allowed storage mount");
      }
    }
  }

  safeObjectPath(objectKey: ObjectKey): string {
    const safeKey = assertObjectKey(objectKey);
    const candidate = path.resolve(this.rootDir, safeKey);
    if (!isPathInside(this.rootDir, candidate) || path.dirname(candidate) !== this.rootDir) {
      throw new StorageSafetyError("Object key escaped the storage root");
    }
    return candidate;
  }

  private async assertObjectFile(filePath: string): Promise<void> {
    const objectStat = await lstat(filePath);
    if (objectStat.isSymbolicLink()) throw new StorageSafetyError("Symlinked objects are not allowed");
    if (!objectStat.isFile()) throw new StorageSafetyError("Object key does not refer to a regular file");
  }

  private async assertObjectAbsent(filePath: string): Promise<void> {
    try {
      const objectStat = await lstat(filePath);
      if (objectStat.isSymbolicLink()) throw new StorageSafetyError("Symlinked objects are not allowed");
      throw new StorageSafetyError("Object key already exists");
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async put(
    source: UploadSource,
    options: { objectKey?: ObjectKey; maxBytes?: number } = {},
  ): Promise<StoredObject> {
    await this.ensureRoot();
    const objectKey = assertObjectKey(options.objectKey ?? newUuid());
    const finalPath = this.safeObjectPath(objectKey);
    const maxBytes = options.maxBytes ?? this.maxUploadBytes;
    assertNonNegativeSafeInteger(maxBytes, "maxBytes");
    if (maxBytes <= 0) throw new ValidationError("maxBytes must be positive");

    await this.assertObjectAbsent(finalPath);

    const temporaryPath = path.join(this.rootDir, `.upload-${newUuid()}.tmp`);
    let handle: FileHandle | undefined;
    let totalBytes = 0;
    const hash = createHash("sha256");

    try {
      handle = await open(
        temporaryPath,
        fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
        0o600,
      );
      for await (const chunk of chunks(source)) {
        if (chunk.byteLength === 0) continue;
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) throw new UploadLimitError(maxBytes, totalBytes);
        hash.update(chunk);
        let written = 0;
        while (written < chunk.byteLength) {
          const result = await handle.write(chunk, written, chunk.byteLength - written);
          written += result.bytesWritten;
          if (result.bytesWritten === 0) throw new StorageSafetyError("Upload write made no progress");
        }
      }
      await handle.sync();
      await handle.close();
      handle = undefined;

      await this.assertObjectAbsent(finalPath);
    } catch (error) {
      await closeQuietly(handle);
      await unlinkQuietly(temporaryPath);
      throw error;
    }

    try {
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await unlinkQuietly(temporaryPath);
      throw new StorageSafetyError(`Atomic object commit failed: ${(error as Error).message}`);
    }

    const sha256 = hash.digest("hex");
    return { objectKey, sizeBytes: totalBytes, sha256, etag: etagForSha256(sha256) };
  }

  async openRead(objectKey: ObjectKey): Promise<Readable> {
    await this.ensureRoot();
    const filePath = this.safeObjectPath(objectKey);
    await this.assertObjectFile(filePath);
    const noFollow = (fsConstants as typeof fsConstants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
    try {
      const handle = await open(filePath, fsConstants.O_RDONLY | noFollow);
      return handle.createReadStream({ autoClose: true });
    } catch (error) {
      if (isNotFound(error)) throw new StorageSafetyError("Object disappeared during read");
      throw error;
    }
  }

  async read(objectKey: ObjectKey): Promise<Buffer> {
    const stream = await this.openRead(objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async exists(objectKey: ObjectKey): Promise<boolean> {
    await this.ensureRoot();
    const filePath = this.safeObjectPath(objectKey);
    try {
      await this.assertObjectFile(filePath);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async delete(objectKey: ObjectKey): Promise<void> {
    await this.ensureRoot();
    const filePath = this.safeObjectPath(objectKey);
    try {
      await this.assertObjectFile(filePath);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
    await unlinkQuietly(filePath);
  }
}

export function storageEtagForSha256(sha256: string): string {
  return etagForSha256(sha256);
}
