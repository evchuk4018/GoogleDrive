import { describe, expect, it } from "vitest";
import { handleMcp } from "@/lib/protocol/mcp-handler";

async function json(response: Response) { return response.json() as Promise<Record<string, any>>; }

describe("MCP JSON-RPC", () => {
  it("initializes and discovers all Drive tools", async () => {
    const initialized = await json(await handleMcp(new Request("http://drive.test/drive/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) })));
    expect(initialized.result.serverInfo.name).toBe("local-googledrive");
    const listed = await json(await handleMcp(new Request("http://drive.test/drive/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) })));
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining(["drive_list", "drive_write_file", "drive_delete_permanently"]));
  });

  it("returns JSON-RPC parse errors for malformed input", async () => {
    const result = await json(await handleMcp(new Request("http://drive.test/drive/mcp", { method: "POST", body: "{" })));
    expect(result.error.code).toBe(-32700);
  });
});
