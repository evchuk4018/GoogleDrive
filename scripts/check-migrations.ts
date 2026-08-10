import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version");
    console.log(JSON.stringify({ applied: result.rows.map((row) => row.version) }));
  } finally {
    await client.end();
  }
}

void main();
