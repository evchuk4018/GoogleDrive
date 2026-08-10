import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDriveConfig } from "@/lib/config/app-config";

export const SESSION_COOKIE = "drive_session";

function equalSecret(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function isBearerAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header || header.slice(0, 7).toLowerCase() !== "bearer ") return false;
  try {
    return equalSecret(header.slice(7), getDriveConfig().apiToken);
  } catch {
    return false;
  }
}

export function createSessionValue(now = Date.now()): { value: string; maxAge: number } {
  const config = getDriveConfig();
  const expiresAt = Math.floor(now / 1000) + config.sessionTtlSeconds;
  const payload = `${expiresAt}.${crypto.randomBytes(16).toString("base64url")}`;
  return { value: `${payload}.${signature(payload, config.apiToken)}`, maxAge: config.sessionTtlSeconds };
}

export function isValidSessionValue(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, provided] = parts;
  if (!/^\d+$/.test(expires) || !nonce || Number(expires) < Math.floor(now / 1000)) return false;
  try {
    return equalSecret(provided, signature(`${expires}.${nonce}`, getDriveConfig().apiToken));
  } catch {
    return false;
  }
}

export async function hasValidSession(): Promise<boolean> {
  return isValidSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(response: Response, value: string, maxAge: number): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

export function clearSessionCookie(response: Response): void {
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function isRequestAuthorized(request: Request, allowSession = true): Promise<boolean> {
  if (isBearerAuthorized(request)) return true;
  return allowSession && isValidSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
}
