import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, optionalLimit } from "@/lib/http/route-utils";
import { serializePage } from "@/lib/http/drive-serialization";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await getDriveService().list(url.searchParams.get("parentId") ?? undefined, { limit: optionalLimit(url.searchParams.get("limit")), cursor: url.searchParams.get("cursor") ?? undefined, includeTrash: url.searchParams.get("includeTrash") === "true" });
    return NextResponse.json(serializePage(result));
  } catch (error) { return errorResponse(error); }
}
