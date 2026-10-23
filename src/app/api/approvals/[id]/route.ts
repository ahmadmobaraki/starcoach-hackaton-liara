import { callMcpTool, connectMcp } from "@/lib/mcp/client";
import {
  addAgentContext,
  getSession,
  saveSession,
} from "@/lib/agent/session";
import { appendAudit } from "@/lib/security/audit";
import { decideApproval, getApproval } from "@/lib/security/approvals";
import { safeError } from "@/lib/security/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const approval = await getApproval(id);
  if (!approval) {
    return json({ error: "درخواست تأیید پیدا نشد یا منقضی شده است." }, 404);
  }
  return json({ approval });
}

type Body = {
  decision?: "approve" | "reject";
  confirmText?: string;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "بدنه‌ی درخواست معتبر نیست." }, 400);
  }
  if (body.decision !== "approve" && body.decision !== "reject") {
    return json({ error: "تصمیم باید approve یا reject باشد." }, 400);
  }

  const existing = await getApproval(id);
  if (!existing) {
    return json({ error: "درخواست تأیید پیدا نشد یا منقضی شده است." }, 404);
  }

  try {
    const approval = await decideApproval(
      id,
      body.decision,
      body.confirmText,
    );
    await appendAudit({
      type:
        body.decision === "approve"
          ? "approval_approved"
          : "approval_rejected",
      approvalId: id,
      action: approval.action,
      risk: approval.risk,
      sessionId: approval.sessionId,
      detail: { by: "panel" },
    });

    const session = approval.sessionId
      ? await getSession(approval.sessionId)
      : null;

    if (body.decision === "reject") {
      if (session) {
        session.pending = null;
        addAgentContext(
          session,
          "کاربر این اقدام را در کارت تأیید رد کرد. هیچ تغییری اعمال نشد. گزینه‌ی امن‌تر یا توضیح بیشتری پیشنهاد بده و از اجرای دوباره بدون تأیید خودداری کن.",
        );
        await saveSession(session);
      }
      return json({ decision: "reject", approvalId: id, sessionId: approval.sessionId });
    }

    let result: unknown = null;
    let applyError: string | null = null;
    const mcp = await connectMcp();
    try {
      const applied = await callMcpTool(mcp.client, "liara_apply_action", {
        approvalId: id,
        digest: approval.digest,
      });
      if (!applied.ok) {
        applyError =
          applied.raw &&
          typeof applied.raw === "object" &&
          "error" in applied.raw
            ? safeError(
                new Error(String((applied.raw as { error?: unknown }).error)),
              )
            : safeError(new Error(applied.text || "اجرای اقدام ناموفق بود"));
      } else {
        const raw = applied.raw as
          | { result?: unknown; status?: string }
          | null;
        result = raw?.result ?? raw;
        if (raw?.status === "AWAITING_APPROVAL") {
          applyError = "اقدام هنوز تأیید نشده بود؛ هیچ تغییری اعمال نشد.";
        }
      }
    } catch (error) {
      applyError = safeError(error);
    } finally {
      await mcp.close();
    }

    if (session) {
      session.pending = null;
      addAgentContext(
        session,
        applyError
          ? `کاربر این اقدام را تأیید کرد اما اجرای آن با خطا مواجه شد: ${applyError}\nاین خطا را به زبان ساده توضیح بده، علت احتمالی را بگو و قدم بعدی امن پیشنهاد بده.`
          : `کاربر این اقدام را تأیید کرد و اجرای آن انجام شد. نتیجه:\n${JSON.stringify(result)}\nحالا با ابزارهای خواندنی نتیجه را بررسی کن و به کاربر گزارش بده.`,
      );
      await saveSession(session);
    }

    return json({
      decision: "approve",
      approvalId: id,
      sessionId: approval.sessionId,
      result,
      error: applyError,
    });
  } catch (error) {
    return json({ error: safeError(error) }, 400);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
