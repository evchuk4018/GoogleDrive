import { describe, expect, it, beforeEach } from "vitest";
import { createSessionValue, isBearerAuthorized, isValidSessionValue } from "@/lib/auth/auth";

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test/test";
  process.env.DRIVE_API_TOKEN = "unit-test-token";
  process.env.DRIVE_SESSION_TTL_SECONDS = "60";
  process.env.ROOT_FOLDER_ID = "00000000-0000-4000-8000-000000000001";
});

describe("Drive authentication", () => {
  it("authenticates bearer tokens without accepting near matches", () => {
    expect(isBearerAuthorized(new Request("http://drive.test", { headers: { authorization: "Bearer unit-test-token" } }))).toBe(true);
    expect(isBearerAuthorized(new Request("http://drive.test", { headers: { authorization: "bearer unit-test-token" } }))).toBe(true);
    expect(isBearerAuthorized(new Request("http://drive.test", { headers: { authorization: "Bearer wrong" } }))).toBe(false);
  });

  it("creates expiring signed browser sessions", () => {
    const now = Date.now();
    const session = createSessionValue(now);
    expect(isValidSessionValue(session.value, now)).toBe(true);
    expect(isValidSessionValue(session.value, now + 61_000)).toBe(false);
    expect(isValidSessionValue(`${session.value}x`, now)).toBe(false);
  });
});
