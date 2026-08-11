import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse } from "@/lib/http/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { item, stream } = await getDriveService().download((await context.params).id);
    return new NextResponse(Readable.toWeb(stream as Readable) as unknown as BodyInit, { headers: {
      "Content-Type": item.contentType,
      "Content-Length": String(item.sizeBytes),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      ETag: item.etag ?? "",
    } });
  } catch (error) { return errorResponse(error); }
}
