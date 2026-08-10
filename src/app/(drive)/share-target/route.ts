import { handleShareTarget } from "@/lib/http/share-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleShareTarget(request);
}
