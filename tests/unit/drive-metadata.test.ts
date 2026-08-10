import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMetadata(basePath: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DRIVE_BASE_PATH", basePath);

  const layout = await import("@/app/layout");
  return { metadata: layout.metadata, viewport: layout.viewport };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Drive iOS PWA metadata", () => {
  it("emits Apple install metadata and an Apple touch icon at the root", async () => {
    const { metadata } = await loadMetadata("");

    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: "Drive",
      statusBarStyle: "black-translucent",
    });
    expect(metadata.icons?.apple).toEqual({
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    });
  });

  it("prefixes the Apple touch icon without changing the existing PWA paths", async () => {
    const { metadata } = await loadMetadata("/drive");

    expect(metadata.icons?.apple).toMatchObject({
      url: "/drive/apple-touch-icon.png",
    });
    expect(metadata.manifest).toBe("/drive/manifest.webmanifest");
    expect(metadata.icons?.icon).toBe("/drive/drive-icon.svg");
  });

  it("locks the installed app to the device viewport", async () => {
    const { viewport } = await loadMetadata("");

    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      viewportFit: "cover",
    });
  });
});
