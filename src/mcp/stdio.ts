#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
process.chdir(projectRoot);
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

async function main() {
  const { createLiaraMcpServer } = await import("@/lib/mcp/server");
  const server = createLiaraMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "raahbar-liara MCP server running on stdio. Add it to your MCP client config.",
  );
}

main().catch((error) => {
  console.error("Failed to start raahbar-liara MCP server:", error);
  process.exit(1);
});
