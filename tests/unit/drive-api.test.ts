import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRIVE_READ_TIMEOUT_MS,
  DriveApiError,
  DriveNetworkError,
  DriveRequestTimeoutError,
  listItems,
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
      expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) }),
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
});
