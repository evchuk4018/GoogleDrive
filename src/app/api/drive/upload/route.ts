import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { DriveError } from "@/lib/domain/types";
import { errorResponse } from "@/lib/http/route-utils";
import { serializeItem } from "@/lib/http/drive-serialization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!request.body) throw new DriveError("EMPTY_UPLOAD", "Upload body is empty", 400);
    const name = request.headers.get("x-filename");
    if (!name) throw new DriveError("MISSING_FILENAME", "X-Filename header is required", 400);
    const item = await getDriveService().upload({
      body: request.body,
      name,
      parentId: request.headers.get("x-parent-id") ?? undefined,
      mimeType: request.headers.get("content-type") ?? undefined,
      ifMatch: request.headers.get("if-match") ?? undefined,
      overwriteId: request.headers.get("x-overwrite-id") ?? undefined,
    });
    return NextResponse.json(serializeItem(item), { status: 201, headers: { ETag: item.etag } });
  } catch (error) { return errorResponse(error); }
}
