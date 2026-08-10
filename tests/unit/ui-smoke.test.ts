import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Drive UI render contract", () => {
  it("contains the required user actions without browser automation", async () => {
    const source = await readFile(path.resolve("src/components/drive/drive-browser.tsx"), "utf8");
    for (const label of ["Upload file", "New folder", "Rename", "Move", "Trash", "Restore", "Delete forever", "Search files and folders"]) {
      expect(source).toContain(label);
    }
  });
});
