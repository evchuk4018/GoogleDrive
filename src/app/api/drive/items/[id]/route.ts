import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, jsonBody, requireAuth } from "@/lib/http/route-utils";
import { serializeItem } from "@/lib/http/drive-serialization";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = await requireAuth(request); if (denied) return denied;
  try { const item = await getDriveService().metadata((await context.params).id); return NextResponse.json(serializeItem(item), { headers: { ETag: item.etag } }); }
  catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  const denied = await requireAuth(request); if (denied) return denied;
  try {
    const body = await jsonBody(request);
    const changes: { name?: string; parentId?: string | null } = {};
    if (body.name !== undefined) changes.name = typeof body.name === "string" ? body.name : "";
    if (body.parentId !== undefined) changes.parentId = body.parentId === null ? null : typeof body.parentId === "string" ? body.parentId : "";
    const item = await getDriveService().update((await context.params).id, changes, request.headers.get("if-match") ?? undefined);
    return NextResponse.json(serializeItem(item), { headers: { ETag: item.etag } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  const denied = await requireAuth(request); if (denied) return denied;
  try { await getDriveService().trash((await context.params).id, request.headers.get("if-match") ?? undefined); return new NextResponse(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
