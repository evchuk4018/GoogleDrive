import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIVE_READ_TIMEOUT_MS, DriveRequestTimeoutError, listItems } from "@/components/drive/drive-api";

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
});
