import { NextResponse } from "next/server";
import { DriveError } from "@/lib/domain/types";
import { isDriveDomainError } from "@/lib/domain/errors";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof DriveError || isDriveDomainError(error)) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred" } }, { status: 500 });
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new DriveError("INVALID_JSON", "Request body must be a JSON object", 400); }
}

export function optionalLimit(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new DriveError("INVALID_LIMIT", "limit must be an integer from 1 to 100", 422);
  return parsed;
}
