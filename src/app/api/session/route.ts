import { getSession } from "@/lib/agent/session";
import { getPublicConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({
      session: null,
      config: getPublicConfig(),
    });
  }
  const session = await getSession(id);
  if (!session) {
    return Response.json(
      { session: null, config: getPublicConfig() },
      { status: 404 },
    );
  }
  return Response.json({
    session,
    config: getPublicConfig(),
  });
}
