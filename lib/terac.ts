import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type TeracCall = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
export async function withTerac<T>(work: (call: TeracCall) => Promise<T>): Promise<T> {
  const token = process.env.TERAC_API_KEY || process.env.TERAC_MCP_TOKEN;
  if (!token) throw new Error("Terac API key is not configured");
  const client = new Client({ name: "second-look", version: "1.0.0" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("https://terac.com/api/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }));
    const call: TeracCall = async <R>(name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 45_000 });
      if (result.isError) throw new Error(`Terac tool failed: ${name}`);
      if (result.structuredContent) return result.structuredContent as R;
      const text = Array.isArray(result.content) ? result.content.find((b: { type: string; text?: string }) => b.type === "text") : undefined;
      if (!text || typeof text.text !== "string") throw new Error(`Missing Terac response: ${name}`);
      return JSON.parse(text.text) as R;
    };
    return await work(call);
  } finally {
    await client.close().catch(() => {});
  }
}
