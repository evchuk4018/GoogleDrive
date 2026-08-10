import { describe, expect, it } from "vitest";
import { assertObjectKey, normalizeItemName, assertPositivePageLimit } from "@/lib/domain/validation";

describe("Drive validation", () => {
  it("keeps names to one safe path component", () => {
    expect(normalizeItemName("  résumé.txt  ")).toBe("résumé.txt");
    expect(() => normalizeItemName("../secret")).toThrow();
    expect(() => normalizeItemName("folder/file")).toThrow();
    expect(() => normalizeItemName(".")).toThrow();
  });

  it("accepts only UUID object keys and bounded page limits", () => {
    expect(assertObjectKey("00000000-0000-4000-8000-000000000001")).toBe("00000000-0000-4000-8000-000000000001");
    expect(() => assertObjectKey("../../etc/passwd")).toThrow();
    expect(() => assertPositivePageLimit(101, 50, 100)).toThrow();
    expect(assertPositivePageLimit(undefined, 50, 100)).toBe(50);
  });
});
