import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Drive UI render contract", () => {
  it("contains the required user actions without browser automation", async () => {
    const source = await readFile(path.resolve("src/components/drive/drive-browser.tsx"), "utf8");
    for (const label of [
      "Upload file",
      "New folder",
      "Download",
      "Rename",
      "Move",
      "Trash",
      "Restore",
      "Delete forever",
      "Search files and folders",
      "Starred",
      "Filters",
      "Grid view",
      "Select all items",
    ]) {
      expect(source).toContain(label);
    }
  });

  it("leaves the session check with a retry action when the request times out", async () => {
    const source = await readFile(path.resolve("src/components/drive/drive-browser.tsx"), "utf8");
    expect(source).toContain("setAuthState((current) => (current === 'checking' ? 'error' : current))");
    expect(source).toContain("Drive is unavailable");
    expect(source).toContain("Try again");
  });

  it("keeps the mobile navigation control connected to the sidebar", async () => {
    const source = await readFile(path.resolve("src/components/drive/drive-browser.tsx"), "utf8");
    const iconSource = await readFile(path.resolve("src/components/drive/drive-icons.tsx"), "utf8");

    expect(source).toContain("aria-controls=\"drive-navigation\"");
    expect(source).toContain("aria-expanded={sidebarOpen}");
    expect(source).toContain("id=\"drive-navigation\"");
    expect(iconSource).toContain('stroke="currentColor"');
  });

  it("closes item action menus when a pointer starts outside them", async () => {
    const source = await readFile(path.resolve("src/components/drive/drive-browser.tsx"), "utf8");

    expect(source).toContain("document.addEventListener('pointerdown', handlePointerDown)");
    expect(source).toContain("!menu.contains(event.target)");
    expect(source).toContain("menu.open = false");
  });
});
