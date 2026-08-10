import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/domain/errors";
import { uploadSharedFiles, type SharedUploadFile } from "@/lib/domain/share-upload";
import { handleShareTarget } from "@/lib/http/share-target";

async function* bytes(value: string): AsyncGenerator<Uint8Array> {
  yield Buffer.from(value);
}

function uploadFile(name: string, value: string): SharedUploadFile {
  return { name, mimeType: "text/plain", body: bytes(value) };
}

describe("shared file uploads", () => {
  it("uploads every shared file into the Drive root", async () => {
    const calls: Array<{ name: string; parentId?: string | null }> = [];
    const result = await uploadSharedFiles(
      [uploadFile("one.txt", "one"), uploadFile("two.txt", "two")],
      {
        upload: async (input) => {
          calls.push({ name: input.name, parentId: input.parentId });
          return {} as never;
        },
      },
    );

    expect(result).toEqual({ uploaded: 2, failed: 0 });
    expect(calls).toEqual([
      { name: "one.txt", parentId: null },
      { name: "two.txt", parentId: null },
    ]);
  });

  it("continues after an individual file fails", async () => {
    const calls: string[] = [];
    const result = await uploadSharedFiles(
      [uploadFile("one.txt", "one"), uploadFile("duplicate.txt", "duplicate"), uploadFile("three.txt", "three")],
      {
        upload: async (input) => {
          calls.push(input.name);
          if (input.name === "duplicate.txt") throw new Error("duplicate");
          return {} as never;
        },
      },
    );

    expect(result).toEqual({ uploaded: 2, failed: 1 });
    expect(calls).toEqual(["one.txt", "duplicate.txt", "three.txt"]);
  });

  it("rejects an empty share", async () => {
    await expect(uploadSharedFiles([], { upload: async () => ({}) as never })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("share target route", () => {
  it("accepts all multipart files and redirects with the upload result", async () => {
    const form = new FormData();
    form.append("files", new File(["one"], "one.txt", { type: "text/plain" }));
    form.append("files", new File(["two"], "two.txt", { type: "text/plain" }));

    let received: SharedUploadFile[] = [];
    const response = await handleShareTarget(
      new Request("https://drive.test/share-target", { method: "POST", body: form }),
      {
        isAuthorized: () => true,
        uploadFiles: async (files) => {
          received = [...files];
          return { uploaded: 2, failed: 0 };
        },
      },
    );

    expect(received.map((file) => ({ name: file.name, mimeType: file.mimeType }))).toEqual([
      { name: "one.txt", mimeType: "text/plain" },
      { name: "two.txt", mimeType: "text/plain" },
    ]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://drive.test/?shared=success&uploaded=2&failed=0");
  });

  it("redirects an unauthenticated share back to Drive with a sign-in notice", async () => {
    const response = await handleShareTarget(
      new Request("https://drive.test/share-target", { method: "POST" }),
      { isAuthorized: () => false },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://drive.test/?share=signin");
  });
});
