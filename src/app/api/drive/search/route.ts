import { NextResponse } from "next/server";
import { getDriveService } from "@/lib/domain/drive-service";
import { ValidationError } from "@/lib/domain/errors";
import { errorResponse, optionalLimit, requireAuth } from "@/lib/http/route-utils";
import { serializePage } from "@/lib/http/drive-serialization";
import type { ItemKind, SearchDirection, SearchSort } from "@/lib/domain/types";

function optionalBoolean(value: string | null, field: string): boolean | undefined {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ValidationError(`${field} must be true or false`);
}

function optionalKind(value: string | null): ItemKind | undefined {
  if (value === null) return undefined;
  if (value === "file" || value === "folder") return value;
  throw new ValidationError("kind must be file or folder");
}

function optionalDate(value: string | null, field: string): Date | undefined {
  if (value === null) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} must be a valid date`);
  return date;
}

function optionalSort(value: string | null): SearchSort | undefined {
  if (value === null) return undefined;
  if (value === "name" || value === "size" || value === "kind") return value;
  if (value === "type") return "kind";
  if (value === "updatedAt" || value === "updated" || value === "modified") return "updatedAt";
  throw new ValidationError("sort must be name, updatedAt, size, or kind");
}

function optionalDirection(value: string | null): SearchDirection | undefined {
  if (value === null) return undefined;
  if (value === "asc" || value === "desc") return value;
  throw new ValidationError("direction must be asc or desc");
}

export async function GET(request: Request) {
  const denied = await requireAuth(request); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
    const locationValue = url.searchParams.get("parentId") ?? url.searchParams.get("location");
    const parentId = locationValue === null || locationValue === undefined
      ? undefined
      : locationValue === "" || locationValue.toLowerCase() === "root" ? null : locationValue;
    return NextResponse.json(serializePage(await getDriveService().search(q, {
      limit: optionalLimit(url.searchParams.get("limit")),
      cursor: url.searchParams.get("cursor") ?? undefined,
      includeTrash: optionalBoolean(url.searchParams.get("includeTrash"), "includeTrash"),
      starred: optionalBoolean(url.searchParams.get("starred"), "starred"),
      kind: optionalKind(url.searchParams.get("kind")),
      parentId,
      modifiedAfter: optionalDate(url.searchParams.get("modifiedAfter"), "modifiedAfter"),
      modifiedBefore: optionalDate(url.searchParams.get("modifiedBefore"), "modifiedBefore"),
      sort: optionalSort(url.searchParams.get("sort")),
      direction: optionalDirection(url.searchParams.get("direction")),
    })));
  } catch (error) { return errorResponse(error); }
}
