import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, optionalLimit, requireAuth } from "@/lib/http/route-utils";
import { serializePage } from "@/lib/http/drive-serialization";

export async function GET(request: Request) {
  const denied = await requireAuth(request); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    return NextResponse.json(serializePage(await getDriveService().search(q, { limit: optionalLimit(url.searchParams.get("limit")), cursor: url.searchParams.get("cursor") ?? undefined })));
  } catch (error) { return errorResponse(error); }
}
