import { openapi } from "@/lib/protocol/openapi";

const required = ["/api/health", "/api/drive/items", "/api/drive/folders", "/api/drive/upload", "/api/drive/search", "/drive/mcp"];
for (const path of required) {
  if (!(path in openapi.paths)) throw new Error(`OpenAPI is missing ${path}`);
}
console.log(`OpenAPI contains ${Object.keys(openapi.paths).length} paths`);
