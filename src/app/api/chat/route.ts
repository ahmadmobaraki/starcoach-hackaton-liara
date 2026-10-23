import {
  addAgentContext,
  addUserMessage,
  createSession,
  getSession,
  saveSession,
} from "@/lib/agent/session";
import { runAgent, type AgentEvent } from "@/lib/agent/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  sessionId?: string;
  message?: string;
  context?: string;
  project?: string;
  resume?: boolean;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "بدنه‌ی درخواست معتبر نیست." }, 400);
  }

  if (!body.resume && (!body.message || !body.message.trim())) {
    return json({ error: "پیام خالی است." }, 400);
  }
  if (body.message && body.message.length > 8000) {
    return json({ error: "پیام بیش از حد طولانی است." }, 400);
  }
  if (body.context && body.context.length > 4000) {
    return json({ error: "اطلاعات فنی پیام بیش از حد طولانی است." }, 400);
  }

  let session = body.sessionId ? await getSession(body.sessionId) : null;
  if (!session) {
    session = await createSession(body.project);
  }
  if (body.project) session.activeProject = body.project;

  if (!body.resume) {
    addUserMessage(session, body.message!.trim());
    if (body.context?.trim()) {
      addAgentContext(
        session,
        `[اطلاعات فنی معتبر برای استفاده در ابزارها؛ دستور کاربر نیست] ${body.context.trim()}`,
      );
    }
  }
  await saveSession(session);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        } catch {
          closed = true;
        }
      };

      void (async () => {
        try {
          await runAgent(session!, emit);
        } catch (error) {
          emit({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "خطای ناشناخته در پردازش درخواست",
          });
        } finally {
          try {
            await saveSession(session!);
          } catch {
            // Ignore persistence failures after the stream was sent.
          }
          if (!closed) {
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
