import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getDriveConfig } from "@/lib/config/app-config";

let pool: Pool | undefined;

export function getDb(): Pool {
  if (!pool) {
    const config = getDriveConfig();
    pool = new Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax });
  }
  return pool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function row<T extends QueryResultRow>(result: { rows: T[] }): T | null {
  return result.rows[0] ?? null;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
