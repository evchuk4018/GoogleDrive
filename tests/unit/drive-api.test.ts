import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRIVE_READ_TIMEOUT_MS,
  DriveApiError,
  DriveNetworkError,
  DriveRequestTimeoutError,
  listItems,
  searchItems,
  updateItem,
} from "@/components/drive/drive-api";

describe("Drive API request timeouts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts a metadata request after the read timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = listItems(null);
    const rejection = expect(result).rejects.toBeInstanceOf(DriveRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(DRIVE_READ_TIMEOUT_MS);
    await rejection;

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/drive/items",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("uses a clear error when Drive cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(listItems(null)).rejects.toEqual(
      expect.objectContaining({
        name: DriveNetworkError.name,
        message: "Drive could not be reached. Check your Tailscale connection and try again.",
      }),
    );
  });

  it("does not expose an HTML error page as the message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>wrong app</html>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    })));

    await expect(listItems(null)).rejects.toEqual(
      expect.objectContaining({
        name: DriveApiError.name,
        message: "The Drive endpoint was not found. Check the configured Drive URL.",
        status: 404,
      }),
    );
  });

  it("serializes search filters while retaining the simple query helper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const modifiedAfter = new Date("2026-08-01T00:00:00.000Z");

    await searchItems("report", {
      starred: true,
      kind: "file",
      parentId: null,
      modifiedAfter,
      sort: "updatedAt",
      direction: "desc",
      cursor: "next-page",
      limit: 25,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/drive/search?q=report&cursor=next-page&limit=25&starred=true&kind=file&parentId=root&modifiedAfter=2026-08-01T00%3A00%3A00.000Z&sort=updatedAt&direction=desc",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("exposes one update helper for metadata and star changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));

    await updateItem("item-1", { starred: true });

    expect(fetch).toHaveBeenCalledWith(
      "/api/drive/items/item-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ starred: true }),
      }),
    );
  });
});
