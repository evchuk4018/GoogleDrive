import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/auth";

export async function POST() {
  const response = NextResponse.json({ authenticated: false });
  clearSessionCookie(response);
  return response;
}
