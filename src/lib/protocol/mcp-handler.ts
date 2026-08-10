import { NextResponse } from "next/server";
import { getDriveConfig } from "@/lib/config/app-config";
import { getDriveService } from "@/lib/domain/drive-service";
import { DriveError } from "@/lib/domain/types";
import { mcpTools } from "@/lib/protocol/mcp-tools";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

function rpc(id: JsonRpcRequest["id"], result: unknown): NextResponse { return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }); }
function rpcError(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): NextResponse { return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function argString(args: Record<string, unknown>, key: string, required = true): string | undefined {
  const value = args[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string") throw new DriveError("INVALID_ARGUMENT", `${key} must be a string`, 422);
  return value;
}
function argNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new DriveError("INVALID_ARGUMENT", `${key} must be an integer`, 422);
  return value;
}
function contentResult(data: unknown): { content: [{ type: "text"; text: string }]; structuredContent: unknown } {
  return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const service = getDriveService();
  switch (name) {
    case "drive_list": return service.list(argString(args, "parent_id", false), { cursor: argString(args, "cursor", false), limit: argNumber(args, "limit"), includeTrash: args.include_trash === true });
    case "drive_search": return service.search(argString(args, "query")!, { cursor: argString(args, "cursor", false), limit: argNumber(args, "limit") });
    case "drive_get_metadata": return service.metadata(argString(args, "id")!);
    case "drive_read_text": return service.readText(argString(args, "id")!);
    case "drive_create_folder": return service.createFolder(argString(args, "name")!, argString(args, "parent_id", false));
    case "drive_rename_item": return service.update(argString(args, "id")!, { name: argString(args, "name") }, argString(args, "if_match", false));
    case "drive_move_item": return service.update(argString(args, "id")!, { parentId: argString(args, "parent_id") }, argString(args, "if_match", false));
    case "drive_trash_item": return { items: await service.trash(argString(args, "id")!) };
    case "drive_restore_item": return { items: await service.restore(argString(args, "id")!) };
    case "drive_delete_permanently": await service.deletePermanently(argString(args, "id")!); return { deleted: true };
    case "drive_write_file": {
      const content = argString(args, "content")!;
      const encoding = args.encoding === "base64" ? "base64" : "utf8";
      const bytes = Buffer.from(content, encoding);
      if (bytes.byteLength > getDriveConfig().maxMcpWriteBytes) throw new DriveError("UPLOAD_TOO_LARGE", "MCP write exceeds configured limit", 413);
      const item = await service.upload({ name: argString(args, "name")!, parentId: argString(args, "parent_id", false), mimeType: argString(args, "mime_type", false), overwriteId: argString(args, "overwrite_id", false), ifMatch: argString(args, "if_match", false), body: (async function* () { yield bytes; })(), maxBytes: getDriveConfig().maxMcpWriteBytes });
      return item;
    }
    default: throw new DriveError("UNKNOWN_TOOL", `Unknown tool ${name}`, 404);
  }
}

export async function handleMcp(request: Request): Promise<NextResponse> {
  let message: JsonRpcRequest;
  try {
    message = await request.json() as JsonRpcRequest;
  } catch { return rpcError(null, -32700, "Parse error"); }
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return rpcError(message.id, -32600, "Invalid Request");
  if (message.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  if (message.method === "initialize") return rpc(message.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "local-googledrive", version: "1.0.0" } });
  if (message.method === "tools/list") return rpc(message.id, { tools: mcpTools });
  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments;
    if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) return rpcError(message.id, -32602, "tools/call requires name and object arguments");
    try { return rpc(message.id, contentResult(await callTool(name, args as Record<string, unknown>))); }
    catch (error) {
      if (error instanceof DriveError) return rpc(message.id, { ...contentResult({ code: error.code, message: error.message }), isError: true });
      console.error(error); return rpcError(message.id, -32603, "Internal error");
    }
  }
  return rpcError(message.id, -32601, `Method not found: ${message.method}`);
}
