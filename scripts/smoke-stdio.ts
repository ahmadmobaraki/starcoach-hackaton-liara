import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/stdio.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    { name: "raahbar-stdio-smoke", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`stdio MCP tools: ${tools.tools.length}`);
  const result = await client.callTool({
    name: "liara_list_guides",
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
  console.log(text.slice(0, 500));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
