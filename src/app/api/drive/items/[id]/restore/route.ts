import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, requireAuth } from "@/lib/http/route-utils";
import { serializeItems } from "@/lib/http/drive-serialization";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request); if (denied) return denied;
  try { return NextResponse.json({ items: serializeItems(await getDriveService().restore((await context.params).id, request.headers.get("if-match") ?? undefined)) }); }
  catch (error) { return errorResponse(error); }
}
