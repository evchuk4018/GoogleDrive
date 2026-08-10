import { NextResponse } from "next/server";
import { createSessionValue, setSessionCookie } from "@/lib/auth/auth";
import { getDriveConfig } from "@/lib/config/app-config";
import { errorResponse, jsonBody } from "@/lib/http/route-utils";
import crypto from "node:crypto";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const token = typeof body.token === "string" ? body.token : "";
    const expected = Buffer.from(getDriveConfig().apiToken);
    const supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, { status: 401 });
    }
    const session = createSessionValue();
    const response = NextResponse.json({ authenticated: true });
    setSessionCookie(response, session.value, session.maxAge);
    return response;
  } catch (error) { return errorResponse(error); }
}
