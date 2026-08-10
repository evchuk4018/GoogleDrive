import { NextResponse } from "next/server";
import { openapi } from "@/lib/protocol/openapi";

export function GET() {
  return NextResponse.json(openapi);
}
