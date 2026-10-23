import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:3000/api/mcp"),
  );
  const client = new Client(
    { name: "raahbar-http-smoke", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`HTTP MCP tools: ${tools.tools.length}`);
  const result = await client.callTool({
    name: "liara_account",
    arguments: {},
  });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter(
      (item): item is { type: "text"; text: string } =>
        Boolean(item) && typeof item === "object" && (item as { type?: string }).type === "text",
    )
    .map((item) => item.text)
    .join("\n");
  console.log(text.slice(0, 600));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
