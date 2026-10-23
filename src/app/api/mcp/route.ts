import crypto from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createLiaraMcpServer } from "@/lib/mcp/server";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Session = {
  server: ReturnType<typeof createLiaraMcpServer>;
  transport: WebStandardStreamableHTTPServerTransport;
};

const globalForMcp = globalThis as unknown as {
  __raahbarMcpSessions?: Map<string, Session>;
};
const sessions =
  globalForMcp.__raahbarMcpSessions ??
  (globalForMcp.__raahbarMcpSessions = new Map<string, Session>());

function unauthorized(message = "Unauthorized") {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

function checkAuth(request: Request): Response | null {
  let expected: string | undefined;
  try {
    expected = getConfig().mcpAuthToken;
  } catch {
    expected = process.env.MCP_AUTH_TOKEN;
  }
  if (!expected) return null;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || token !== expected) return unauthorized();
  return null;
}

async function transportFor(request: Request): Promise<WebStandardStreamableHTTPServerTransport> {
  const sessionId = request.headers.get("mcp-session-id");
  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) return existing.transport;
  }

  const server = createLiaraMcpServer();
  const holder: { transport?: WebStandardStreamableHTTPServerTransport } = {};
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: false,
    onsessioninitialized: (id) => {
      if (holder.transport) sessions.set(id, { server, transport: holder.transport });
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
    },
  });
  holder.transport = transport;
  await server.connect(transport);
  return transport;
}

export async function GET(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  const transport = await transportFor(request);
  return transport.handleRequest(request);
}

export async function POST(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  const transport = await transportFor(request);
  return transport.handleRequest(request);
}

export async function DELETE(request: Request) {
  const authError = checkAuth(request);
  if (authError) return authError;
  const transport = await transportFor(request);
  return transport.handleRequest(request);
}
