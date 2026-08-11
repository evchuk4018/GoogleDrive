import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getDriveConfig, ROOT_FOLDER_ID } from "../../../src/lib/config/app-config";
import {
  ConflictError,
  DuplicateNameError,
  StorageSafetyError,
  UploadLimitError,
  ValidationError,
} from "../../../src/lib/domain/errors";
import { DriveService } from "../../../src/lib/domain/drive-service";
import { normalizeItemName } from "../../../src/lib/domain/validation";
import { LocalFilesystemStorage } from "../../../src/lib/storage/local-filesystem";
import { MemoryDriveRepository } from "./memory-repository";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "googledrive-unit-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function* bytes(value: string): AsyncGenerator<Uint8Array> {
  yield Buffer.from(value);
}

async function serviceFixture(maxUploadBytes = 1024 * 1024) {
  const directory = await temporaryDirectory();
  const repository = new MemoryDriveRepository();
  repository.seedFolder(null, "My Drive", ROOT_FOLDER_ID);
  const storage = new LocalFilesystemStorage({ rootDir: directory, maxUploadBytes });
  const service = new DriveService(repository, storage);
  return { directory, repository, storage, service };
}

afterEach(async () => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe("configuration and item validation", () => {
  it("exposes stable environment and root-folder configuration", () => {
    const config = getDriveConfig({
      DATABASE_URL: "postgres://drive",
      DRIVE_STORAGE_ROOT: "C:/drive-data",
      DRIVE_MAX_UPLOAD_BYTES: "4096",
      DRIVE_MCP_MAX_READ_BYTES: "128",
      ROOT_FOLDER_ID,
    });

    expect(config.DATABASE_URL).toBe("postgres://drive");
    expect(config.DRIVE_MAX_UPLOAD_BYTES).toBe(4096);
    expect(config.DRIVE_MCP_MAX_READ_BYTES).toBe(128);
    expect(config.ROOT_FOLDER_ID).toBe(ROOT_FOLDER_ID);
    expect(config.databaseUrl).toBe(config.DATABASE_URL);
  });

  it("rejects unsafe folder and file names", () => {
    expect(() => normalizeItemName("..\\outside")).toThrow(ValidationError);
    expect(() => normalizeItemName("\u0000bad")).toThrow(ValidationError);
    expect(() => normalizeItemName("   ")).toThrow(ValidationError);
    expect(normalizeItemName(" report.txt ")).toBe("report.txt");
  });
});

describe("local filesystem storage", () => {
  it("uses UUID object keys, atomic writes, SHA-256 hashes, and quoted ETags", async () => {
    const directory = await temporaryDirectory();
    const storage = new LocalFilesystemStorage({ rootDir: directory, maxUploadBytes: 1024 });
    const stored = await storage.put(Buffer.from("hello"));
    const expectedHash = createHash("sha256").update("hello").digest("hex");

    expect(stored.objectKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(stored.sha256).toBe(expectedHash);
    expect(stored.etag).toBe(`"${expectedHash}"`);
    expect((await storage.read(stored.objectKey)).toString()).toBe("hello");
    expect((await readdir(directory)).filter((entry) => entry.endsWith(".tmp"))).toEqual([]);
  });

  it("cleans a temporary upload after a source failure and enforces byte limits", async () => {
    const directory = await temporaryDirectory();
    const storage = new LocalFilesystemStorage({ rootDir: directory, maxUploadBytes: 4 });

    async function* failingSource(): AsyncGenerator<Uint8Array> {
      yield Buffer.from("ok");
      throw new Error("source failed");
    }

    await expect(storage.put(failingSource())).rejects.toThrow("source failed");
    await expect(storage.put(Buffer.from("12345"))).rejects.toBeInstanceOf(UploadLimitError);
    expect((await readdir(directory)).filter((entry) => entry.startsWith(".upload-")).length).toBe(0);
  });

  it("rejects traversal, non-UUID keys, the filesystem root, and symlinked objects", async () => {
    const directory = await temporaryDirectory();
    const storage = new LocalFilesystemStorage({ rootDir: directory });
    expect(() => storage.safeObjectPath("../../outside")).toThrow();
    expect(() => storage.safeObjectPath("file.txt")).toThrow();
    expect(() => new LocalFilesystemStorage(path.parse(directory).root)).toThrow(StorageSafetyError);

    const stored = await storage.put(Buffer.from("safe"));
    const outside = path.join(directory, "..", "outside-target");
    await rm(outside, { force: true });
    try {
      await (await import("node:fs/promises")).symlink(outside, path.join(directory, stored.objectKey));
      await expect(storage.openRead(stored.objectKey)).rejects.toBeInstanceOf(StorageSafetyError);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM" && (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  });
});

describe("DriveService hierarchy and conditional mutations", () => {
  it("stars items and supports filtered, sorted, cursor-paginated search", async () => {
    const { service } = await serviceFixture();
    const folder = await service.createFolder("Projects");
    const zebra = await service.upload({ name: "Zebra report.txt", parentId: folder.id, body: bytes("zebra"), maxBytes: 1024 * 1024 });
    const alpha = await service.upload({ name: "Alpha report.txt", parentId: folder.id, body: bytes("alpha"), maxBytes: 1024 * 1024 });

    const starredZebra = await service.update(zebra.id, { starred: true }, zebra.etag);
    await service.update(alpha.id, { starred: true }, alpha.etag);
    expect(starredZebra.starred).toBe(true);

    const firstPage = await service.search("report", {
      starred: true,
      kind: "file",
      parentId: folder.id,
      modifiedAfter: new Date(Date.now() - 5_000),
      modifiedBefore: new Date(Date.now() + 5_000),
      sort: "name",
      direction: "desc",
      limit: 1,
    });
    expect(firstPage.items.map((item) => item.name)).toEqual(["Zebra report.txt"]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await service.search("report", {
      starred: true,
      kind: "file",
      parentId: folder.id,
      sort: "name",
      direction: "desc",
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.name)).toEqual(["Alpha report.txt"]);
  });

  it("protects duplicate sibling names case-insensitively", async () => {
    const { service } = await serviceFixture();
    await service.createFolder("Documents");
    await expect(service.createFolder("documents")).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it("trashes and restores a complete subtree", async () => {
    const { service } = await serviceFixture();
    const folder = await service.createFolder("Projects");
    const child = await service.createFolder("2026", folder.id);
    const file = await service.upload({ name: "plan.txt", parentId: child.id, body: bytes("plan"), maxBytes: 1024 * 1024 });

    const trashed = await service.trash(folder.id, folder.etag);
    expect(trashed).toHaveLength(3);
    expect((await service.metadata(folder.id)).trashedAt).not.toBeNull();
    expect((await service.metadata(child.id)).trashedAt).not.toBeNull();
    expect((await service.metadata(file.id)).trashedAt).not.toBeNull();

    await service.restore(folder.id, trashed[0].etag);
    expect((await service.metadata(folder.id)).trashedAt).toBeNull();
    expect((await service.metadata(child.id)).trashedAt).toBeNull();
    expect((await service.metadata(file.id)).trashedAt).toBeNull();
  });

  it("fails an atomic restore when a sibling name conflicts", async () => {
    const { service } = await serviceFixture();
    const original = await service.createFolder("Archive");
    const trashed = await service.trash(original.id, original.etag);
    await service.createFolder("archive");

    await expect(service.restore(original.id, trashed[0].etag)).rejects.toBeInstanceOf(DuplicateNameError);
    expect((await service.metadata(original.id)).trashedAt).not.toBeNull();
  });

  it("rejects stale If-Match writes without changing the newer file", async () => {
    const { service, storage } = await serviceFixture();
    const file = await service.upload({ name: "note.txt", body: bytes("old"), maxBytes: 1024 * 1024 });
    await service.upload({ name: "note.txt", body: bytes("new"), overwriteId: file.id, ifMatch: file.etag, maxBytes: 1024 * 1024 });

    await expect(
      service.upload({ name: "note.txt", body: bytes("stale"), overwriteId: file.id, ifMatch: file.etag, maxBytes: 1024 * 1024 }),
    ).rejects.toBeInstanceOf(ConflictError);
    const current = await service.metadata(file.id);
    expect(current.kind).toBe("file");
    if (current.kind === "file") expect((await storage.read(current.objectKey)).toString()).toBe("new");
  });

  it("permanently deletes metadata and every file object in a subtree", async () => {
    const { service, storage, repository } = await serviceFixture();
    const folder = await service.createFolder("Delete me");
    const file = await service.upload({ name: "data.bin", parentId: folder.id, body: bytes("bytes"), maxBytes: 1024 * 1024 });
    expect(await storage.exists(file.objectKey)).toBe(true);

    await service.trash(folder.id, folder.etag);
    await service.deletePermanently(folder.id);
    expect(await repository.findById(folder.id, { includeTrashed: true })).toBeNull();
    expect(await repository.findById(file.id, { includeTrashed: true })).toBeNull();
    expect(await storage.exists(file.objectKey)).toBe(false);
  });
});
