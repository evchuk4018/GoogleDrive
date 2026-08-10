import { handleMcp } from "@/lib/protocol/mcp-handler";
import { requireAuth } from "@/lib/http/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = await requireAuth(request, true); if (denied) return denied;
  return handleMcp(request);
}
