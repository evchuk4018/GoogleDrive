export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "Local Google Drive API",
    version: "1.0.0",
    description: "Single-owner, local-disk Google Drive compatible file service.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/health": {
      get: { security: [], responses: { "200": { description: "Service and database readiness" } } },
    },
    "/api/auth/login": {
      post: {
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
        responses: { "200": { description: "Authenticated session" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/drive/items": {
      get: {
        parameters: [
          { name: "parentId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "includeTrash", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "Items" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/drive/search": {
      get: {
        parameters: [
          { name: "q", in: "query", schema: { type: "string", maxLength: 256 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "includeTrash", in: "query", schema: { type: "boolean" } },
          { name: "starred", in: "query", schema: { type: "boolean" } },
          { name: "kind", in: "query", schema: { type: "string", enum: ["file", "folder"] } },
          { name: "parentId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "modifiedAfter", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "modifiedBefore", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["name", "updatedAt", "size", "kind"] } },
          { name: "direction", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: { "200": { description: "Matching items" }, "401": { $ref: "#/components/responses/Unauthorized" } },
      },
    },
    "/api/drive/folders": {
      post: {
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateFolderRequest" } } } },
        responses: { "201": { description: "Folder" }, "409": { description: "Duplicate name or conflict" } },
      },
    },
    "/api/drive/upload": {
      post: {
        description: "Streams the request body to local storage. Set X-Filename and optionally X-Parent-Id and Content-Type.",
        parameters: [
          { name: "X-Filename", in: "header", required: true, schema: { type: "string" } },
          { name: "X-Parent-Id", in: "header", schema: { type: "string", format: "uuid" } },
          { name: "If-Match", in: "header", schema: { type: "string" } },
        ],
        requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
        responses: { "201": { description: "Uploaded file" }, "409": { description: "ETag conflict or duplicate name" }, "413": { description: "Upload too large" } },
      },
    },
    "/api/drive/items/{id}": {
      get: { parameters: [{ $ref: "#/components/parameters/ItemId" }], responses: { "200": { description: "Metadata" } } },
      patch: {
        parameters: [{ $ref: "#/components/parameters/ItemId" }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateItemRequest" } } } },
        responses: { "200": { description: "Updated item" }, "409": { description: "Conflict" } },
      },
    },
    "/api/drive/items/{id}/download": {
      get: { parameters: [{ $ref: "#/components/parameters/ItemId" }], responses: { "200": { description: "File bytes" }, "404": { description: "Not found" } } },
    },
    "/api/drive/items/{id}/trash": {
      post: { parameters: [{ $ref: "#/components/parameters/ItemId" }], responses: { "200": { description: "Trashed subtree" } } },
    },
    "/api/drive/items/{id}/restore": {
      post: { parameters: [{ $ref: "#/components/parameters/ItemId" }], responses: { "200": { description: "Restored subtree" }, "409": { description: "Name conflict" } } },
    },
    "/api/drive/items/{id}/permanent": {
      delete: { parameters: [{ $ref: "#/components/parameters/ItemId" }], responses: { "204": { description: "Permanently deleted" } } },
    },
    "/drive/mcp": {
      post: { description: "Streamable HTTP JSON-RPC MCP endpoint", responses: { "200": { description: "JSON-RPC response" } } },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    parameters: { ItemId: { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } } },
    schemas: {
      LoginRequest: { type: "object", required: ["token"], properties: { token: { type: "string" } } },
      CreateFolderRequest: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 1, maxLength: 255 }, parentId: { type: "string", format: "uuid" } } },
      UpdateItemRequest: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 255 }, parentId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] }, starred: { type: "boolean" } }, additionalProperties: false },
    },
    responses: { Unauthorized: { description: "Missing or invalid bearer token/session" } },
  },
} as const;
