import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse } from "@/lib/http/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { text } = await getDriveService().readText((await context.params).id);
    return new NextResponse(text, { headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
}
