import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, requireAuth } from "@/lib/http/route-utils";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request); if (denied) return denied;
  try { await getDriveService().deletePermanently((await context.params).id, request.headers.get("if-match") ?? undefined); return new NextResponse(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
