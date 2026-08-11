import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { errorResponse, jsonBody } from "@/lib/http/route-utils";
import { serializeItem } from "@/lib/http/drive-serialization";

export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const item = await getDriveService().createFolder(typeof body.name === "string" ? body.name : "", typeof body.parentId === "string" ? body.parentId : undefined);
    return NextResponse.json(serializeItem(item), { status: 201 });
  } catch (error) { return errorResponse(error); }
}
