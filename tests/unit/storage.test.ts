import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { LocalFilesystemStorage } from "@/lib/storage/local-filesystem";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function storage(maxUploadBytes = 1024) {
  const root = await mkdtemp(path.join(os.tmpdir(), "googledrive-test-"));
  roots.push(root);
  return new LocalFilesystemStorage(root, { maxUploadBytes });
}

describe("local filesystem storage", () => {
  it("writes atomically and returns a SHA-256 ETag", async () => {
    const store = await storage();
    const result = await store.put(Buffer.from("hello"));
    expect(result.sizeBytes).toBe(5);
    expect(result.sha256).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(result.etag).toBe(`"${result.sha256}"`);
    expect((await store.read(result.objectKey)).toString()).toBe("hello");
    expect((await readdir(store.rootDir)).filter((name) => name.startsWith(".upload-") || name.endsWith(".tmp"))).toEqual([]);
  });

  it("cleans up an over-limit temporary upload", async () => {
    const store = await storage(4);
    await expect(store.put(Buffer.from("12345"))).rejects.toMatchObject({ code: "UPLOAD_LIMIT_EXCEEDED" });
    expect((await readdir(store.rootDir)).filter((name) => name.startsWith(".upload-") || name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects traversal and symlink-shaped object keys", async () => {
    const store = await storage();
    expect(() => store.safeObjectPath("../../etc/passwd")).toThrow();
    expect(() => store.safeObjectPath("not-a-uuid")).toThrow();
  });
});
