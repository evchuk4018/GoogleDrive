import { NextResponse } from "next/server";
import { getDriveConfig } from "@/lib/config/app-config";
import { getDb } from "@/lib/persistence/db";
import { LocalFilesystemStorage } from "@/lib/storage/local-filesystem";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getDriveConfig();
    await getDb().query("SELECT 1");
    await new LocalFilesystemStorage({ rootDir: config.storageRoot, allowedRootDir: config.storageRoot.startsWith("/srv/storage/") ? "/srv/storage" : undefined }).ensureRoot();
    return NextResponse.json({ status: "ready", database: "ready", storage: "ready" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ status: "not_ready", database: "unknown", storage: "unknown" }, { status: 503 });
  }
}
