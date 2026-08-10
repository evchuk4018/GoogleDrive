import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, requireAuth } from "@/lib/http/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAuth(request); if (denied) return denied;
  try {
    const { item, stream } = await getDriveService().download((await context.params).id);
    return new NextResponse(Readable.toWeb(stream as Readable) as unknown as BodyInit, { headers: {
      "Content-Type": item.contentType,
      "Content-Length": String(item.sizeBytes),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      ETag: item.etag ?? "",
    } });
  } catch (error) { return errorResponse(error); }
}
