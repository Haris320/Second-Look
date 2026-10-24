// Terac MCP spike: proves the server can reach the Terac MCP with an org API key.
//   node --env-file=.env.local scripts/terac-tools.mjs           list tools, save schemas, call terac_get_context
//   node --env-file=.env.local scripts/terac-tools.mjs --claude  same call, but through Claude's MCP connector
import { writeFileSync, mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Anthropic from "@anthropic-ai/sdk";

const TERAC_MCP_URL = "https://terac.com/api/mcp";
const token = process.env.TERAC_MCP_TOKEN || process.env.TERAC_API_KEY;
if (!token) {
  console.error("TERAC_API_KEY (or TERAC_MCP_TOKEN) is empty in .env.local");
  process.exit(1);
}

function printToolResult(result) {
  for (const block of result.content ?? []) {
    console.log(block.type === "text" ? block.text : JSON.stringify(block));
  }
}

if (process.argv.includes("--claude")) {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks: "default",
    mcp_servers: [{ type: "url", url: TERAC_MCP_URL, name: "terac", authorization_token: token }],
    tools: [{ type: "mcp_toolset", mcp_server_name: "terac" }],
    messages: [{ role: "user", content: "Call terac_get_context and report our organization name and balance in one line." }],
  });
  if (response.stop_reason === "refusal") {
    console.error("Refused:", response.stop_details);
    process.exit(1);
  }
  for (const block of response.content) {
    if (block.type === "mcp_tool_use") console.log(`[claude called ${block.name}]`);
    if (block.type === "text") console.log(block.text);
  }
} else {
  const client = new Client({ name: "second-look", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(TERAC_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`${tools.length} tools:`);
  for (const tool of tools) console.log(`  ${tool.name}`);

  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/terac-tools.json", JSON.stringify(tools, null, 2));
  console.log("saved docs/terac-tools.json\n");

  if (tools.some((tool) => tool.name === "terac_get_context")) {
    printToolResult(await client.callTool({ name: "terac_get_context", arguments: {} }));
  }
  await client.close();
}
