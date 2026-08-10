import path from "node:path";

/** The well-known parent used for top-level Drive items. */
export const ROOT_FOLDER_ID = "00000000-0000-4000-8000-000000000001";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DriveEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Stable application configuration. The upper-case properties mirror the
 * deployment environment and are the canonical API. The camel-case aliases
 * are retained for existing server modules that consume this config object.
 */
export type DriveConfig = {
  DATABASE_URL: string;
  DRIVE_API_TOKEN: string;
  DRIVE_STORAGE_ROOT: string;
  DRIVE_MAX_UPLOAD_BYTES: number;
  DRIVE_MAX_MCP_WRITE_BYTES: number;
  DRIVE_MCP_MAX_READ_BYTES: number;
  DRIVE_SESSION_TTL_SECONDS: number;
  DRIVE_DB_POOL_MAX: number;
  ROOT_FOLDER_ID: string;

  databaseUrl: string;
  apiToken: string;
  storageRoot: string;
  maxUploadBytes: number;
  maxMcpWriteBytes: number;
  maxMcpReadBytes: number;
  sessionTtlSeconds: number;
  dbPoolMax: number;
  rootFolderId: string;
};

function requiredString(environment: DriveEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(environment: DriveEnvironment, name: string, fallback: number): number {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function rootFolderId(environment: DriveEnvironment): string {
  const value = environment.ROOT_FOLDER_ID?.trim() || ROOT_FOLDER_ID;
  if (!UUID_PATTERN.test(value)) throw new Error("ROOT_FOLDER_ID must be a UUID");
  return value.toLowerCase();
}

/**
 * Read and validate Drive configuration without caching process-global state.
 * Passing an environment object makes configuration deterministic in tests and
 * keeps callers from having to mutate process.env.
 */
export function getDriveConfig(environment: DriveEnvironment = process.env): DriveConfig {
  const databaseUrl = requiredString(environment, "DATABASE_URL");
  const apiToken = requiredString(environment, "DRIVE_API_TOKEN");
  const storageRoot = path.resolve(
    environment.DRIVE_STORAGE_ROOT?.trim() || "/srv/storage/googledrive/files",
  );
  const maxUploadBytes = positiveInt(
    environment,
    "DRIVE_MAX_UPLOAD_BYTES",
    1024 * 1024 * 1024,
  );
  const maxMcpWriteBytes = positiveInt(
    environment,
    "DRIVE_MAX_MCP_WRITE_BYTES",
    8 * 1024 * 1024,
  );
  const maxMcpReadBytes = positiveInt(
    environment,
    "DRIVE_MCP_MAX_READ_BYTES",
    positiveInt(environment, "DRIVE_MAX_READ_BYTES", 256 * 1024),
  );
  const sessionTtlSeconds = positiveInt(
    environment,
    "DRIVE_SESSION_TTL_SECONDS",
    8 * 60 * 60,
  );
  const dbPoolMax = positiveInt(environment, "DRIVE_DB_POOL_MAX", 10);
  const configuredRootFolderId = rootFolderId(environment);

  return {
    DATABASE_URL: databaseUrl,
    DRIVE_API_TOKEN: apiToken,
    DRIVE_STORAGE_ROOT: storageRoot,
    DRIVE_MAX_UPLOAD_BYTES: maxUploadBytes,
    DRIVE_MAX_MCP_WRITE_BYTES: maxMcpWriteBytes,
    DRIVE_MCP_MAX_READ_BYTES: maxMcpReadBytes,
    DRIVE_SESSION_TTL_SECONDS: sessionTtlSeconds,
    DRIVE_DB_POOL_MAX: dbPoolMax,
    ROOT_FOLDER_ID: configuredRootFolderId,

    databaseUrl,
    apiToken,
    storageRoot,
    maxUploadBytes,
    maxMcpWriteBytes,
    maxMcpReadBytes,
    sessionTtlSeconds,
    dbPoolMax,
    rootFolderId: configuredRootFolderId,
  };
}
