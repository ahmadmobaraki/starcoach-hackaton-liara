import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getLlmConfig } from "@/lib/config";
import { connectMcp, callMcpTool, toolDisplayName } from "@/lib/mcp/client";
import { appendAudit } from "@/lib/security/audit";
import { redactText, safeError } from "@/lib/security/redact";
import { buildSystemPrompt } from "./prompt";
import type { ActionPreview } from "@/lib/security/risk-policy";
import {
  addArtifact,
  addAssistantMessage,
  type AgentToolCall,
  type ArtifactKind,
  type Session,
  type ToolTrace,
} from "./session";

export type { AgentEvent } from "./events";
import type { AgentEvent } from "./events";

type Emit = (event: AgentEvent) => void;

type ToolAccumulator = {
  id: string;
  name: string;
  arguments: string;
};

const MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 24_000;

export async function runAgent(
  session: Session,
  emit: Emit,
): Promise<Session> {
  const config = getLlmConfig();
  const openai = new OpenAI({
    apiKey: config.llmApiKey,
    baseURL: config.llmBaseUrl,
    timeout: 120_000,
    maxRetries: 2,
  });

  emit({ type: "meta", sessionId: session.id, model: config.llmModel });
  emit({ type: "status", label: "در حال اتصال به ابزارهای لیارا..." });

  const mcp = await connectMcp();
  try {
    const { tools } = await mcp.client.listTools();
    const openAiTools = toOpenAiTools(tools);
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      emit({ type: "status", label: "در حال فکر کردن..." });

      const messages = buildMessages(session);
      const stream = await openai.chat.completions.create({
        model: config.llmModel,
        messages,
        tools: openAiTools,
        tool_choice: "auto",
        temperature: config.llmTemperature,
        max_tokens: config.llmMaxTokens,
        stream: true,
      });

      let content = "";
      const calls = new Map<number, ToolAccumulator>();
      let emittedText = false;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;
        if (typeof delta.content === "string" && delta.content.length) {
          if (!emittedText) {
            emittedText = true;
            emit({ type: "status", label: "در حال نوشتن پاسخ..." });
          }
          content += delta.content;
          emit({ type: "text", delta: delta.content });
        }
        for (const toolCall of delta.tool_calls ?? []) {
          const index = toolCall.index ?? 0;
          const existing = calls.get(index) ?? {
            id: "",
            name: "",
            arguments: "",
          };
          if (toolCall.id) existing.id = toolCall.id;
          if (toolCall.function?.name) existing.name += toolCall.function.name;
          if (toolCall.function?.arguments) {
            existing.arguments += toolCall.function.arguments;
          }
          calls.set(index, existing);
        }
      }

      const toolCalls = [...calls.values()].filter(
        (call) => call.name && call.id,
      );

      if (!toolCalls.length) {
        const finalContent =
          content.trim() ||
          "متأسفم، پاسخی تولید نشد. می‌توانی درخواستت را کمی دقیق‌تر بگویی؟";
        if (!content.trim()) emit({ type: "text", delta: finalContent });
        addAssistantMessage(session, finalContent);
        session.history.push({
          role: "assistant",
          content: finalContent,
        });
        session.pending = null;
        emit({ type: "done", sessionId: session.id });
        return session;
      }

      const assistantToolCalls: AgentToolCall[] = toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: call.arguments || "{}",
        },
      }));
      session.history.push({
        role: "assistant",
        content: content.trim() || null,
        tool_calls: assistantToolCalls,
      });

      const roundTraces: ToolTrace[] = [];
      const roundArtifacts: string[] = [];
      let approvalPayload:
        | {
            approvalId: string;
            digest: string;
            action: string;
            preview: unknown;
            expiresAt: string;
          }
        | null = null;

      for (const call of toolCalls) {
        const args = parseArgs(call.arguments);
        if (
          (call.name === "liara_prepare_action" ||
            call.name === "liara_cancel_action") &&
          !args.sessionId
        ) {
          args.sessionId = session.id;
        }
        const displayName = toolDisplayName(call.name);
        emit({
          type: "tool_start",
          id: call.id,
          name: call.name,
          displayName,
        });
        const started = Date.now();
        let result: Awaited<ReturnType<typeof callMcpTool>>;
        try {
          result = await callMcpTool(mcp.client, call.name, args);
        } catch (error) {
          result = {
            ok: false,
            isError: true,
            raw: null,
            text: JSON.stringify({
              ok: false,
              error: safeError(error),
            }),
          };
        }
        const durationMs = Date.now() - started;
        const summary = summarizeToolResult(call.name, result.raw, result.text, result.ok);
        const trace: ToolTrace = {
          id: call.id,
          name: call.name,
          displayName,
          status: result.ok ? "ok" : "error",
          summary,
          durationMs,
        };
        roundTraces.push(trace);
        emit({
          type: "tool_result",
          id: call.id,
          name: call.name,
          ok: result.ok,
          summary,
          durationMs,
        });

        if (
          result.raw &&
          typeof result.raw === "object" &&
          (result.raw as { status?: string }).status === "AWAITING_APPROVAL" &&
          "approvalId" in (result.raw as Record<string, unknown>)
        ) {
          const raw = result.raw as {
            approvalId: string;
            digest: string;
            action: string;
            preview: unknown;
            expiresAt: string;
          };
          approvalPayload = {
            approvalId: raw.approvalId,
            digest: raw.digest,
            action: raw.action,
            preview: raw.preview,
            expiresAt: raw.expiresAt,
          };
        }

        const artifact = artifactFor(call.name, result.raw);
        if (artifact) {
          const created = addArtifact(
            session,
            artifact.kind,
            artifact.data,
            artifact.title,
          );
          roundArtifacts.push(created.id);
          emit({
            type: "artifact",
            artifactId: created.id,
            kind: created.kind,
            data: created.data,
          });
        }

        const toolContent = truncateToolResult(result.text);
        session.history.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: toolContent,
        });
        await appendAudit({
          type: "tool_called",
          sessionId: session.id,
          detail: { name: call.name, ok: result.ok, durationMs },
        });
      }

      if (approvalPayload) {
        session.pending = {
          approvalId: approvalPayload.approvalId,
          digest: approvalPayload.digest,
          action: approvalPayload.action,
          preview: approvalPayload.preview as ActionPreview,
          createdAt: new Date().toISOString(),
          expiresAt: approvalPayload.expiresAt,
        };
        addAssistantMessage(
          session,
          content.trim() ||
            "برای ادامه به تأیید شما نیاز دارم. جزئیات و هزینه را در کارت زیر بررسی کن.",
          roundTraces,
          roundArtifacts,
        );
        emit({
          type: "approval",
          approvalId: approvalPayload.approvalId,
          digest: approvalPayload.digest,
          action: approvalPayload.action,
          preview: approvalPayload.preview,
          expiresAt: approvalPayload.expiresAt,
        });
        emit({ type: "done", sessionId: session.id });
        return session;
      }

      addAssistantMessage(session, content.trim(), roundTraces, roundArtifacts);
    }

    const message =
      "برای این درخواست به تعداد زیادی ابزار نیاز شد. بیا مرحله‌به‌مرحله جلو برویم؛ مهم‌ترین قدم بعدی چیست؟";
    addAssistantMessage(session, message);
    emit({ type: "text", delta: message });
    emit({ type: "done", sessionId: session.id });
    return session;
  } catch (error) {
    const message = friendlyAgentError(error);
    addAssistantMessage(session, message);
    emit({ type: "error", message });
    emit({ type: "done", sessionId: session.id });
    return session;
  } finally {
    await mcp.close();
  }
}

function buildMessages(session: Session): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(session) },
  ];
  for (const message of session.history) {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content });
    } else if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: message.content,
        ...(message.tool_calls?.length
          ? {
              tool_calls: message.tool_calls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: {
                  name: call.function.name,
                  arguments: call.function.arguments,
                },
              })),
            }
          : {}),
      });
    } else {
      messages.push({
        role: "tool",
        tool_call_id: message.tool_call_id,
        content: message.content,
      });
    }
  }
  return messages;
}

function toOpenAiTools(
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>,
): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters:
        (tool.inputSchema as Record<string, unknown> | undefined) ?? {
          type: "object",
          properties: {},
        },
    },
  }));
}

function parseArgs(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function summarizeToolResult(
  name: string,
  raw: unknown,
  text: string,
  ok: boolean,
): string {
  if (!ok) {
    if (raw && typeof raw === "object" && "error" in raw) {
      return short(String((raw as { error?: unknown }).error ?? ""));
    }
    return short(text || "خطا");
  }
  if (!raw || typeof raw !== "object") return short(text);
  const record = raw as Record<string, unknown>;
  if (name === "liara_diagnose_app") {
    const diagnosis = record.diagnosis as Record<string, unknown> | undefined;
    return short(
      String(diagnosis?.headline ?? "تشخیص انجام شد") +
        (diagnosis?.findings
          ? ` · ${(diagnosis.findings as unknown[]).length} یافته`
          : ""),
    );
  }
  if (name === "liara_recommend_plan") {
    return short(String(record.summary ?? "پلن پیشنهاد شد"));
  }
  if (name === "liara_get_guide") {
    const guide = record.guide as Record<string, unknown> | undefined;
    return short(String(guide?.title ?? "راهنما آماده شد"));
  }
  if (name === "liara_prepare_action") {
    const preview = record.preview as Record<string, unknown> | undefined;
    return short(String(preview?.title ?? "در انتظار تأیید"));
  }
  if (name === "liara_wait_release") {
    return short(`وضعیت release: ${String(record.state ?? "—")}`);
  }
  if (Array.isArray(record.projects)) {
    return `${(record.projects as unknown[]).length} پروژه`;
  }
  if (Array.isArray(record.vms)) return `${(record.vms as unknown[]).length} سرور`;
  if (Array.isArray(record.domains)) {
    return `${(record.domains as unknown[]).length} دامنه`;
  }
  if (record.count !== undefined) return `${String(record.count)} مورد`;
  return short(text);
}

function artifactFor(
  name: string,
  raw: unknown,
): { kind: ArtifactKind; data: unknown; title?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  switch (name) {
    case "liara_diagnose_app":
      return {
        kind: "diagnosis",
        data: record,
        title: "نتیجه‌ی عیب‌یابی",
      };
    case "liara_recommend_plan":
      return {
        kind: "plan",
        data: record,
        title: "پیشنهاد پلن",
      };
    case "liara_get_project":
      return {
        kind: "project",
        data: record,
        title: "وضعیت پروژه",
      };
    case "liara_app_metrics":
      return {
        kind: "metrics",
        data: record,
        title: "متریک‌های منابع",
      };
    case "liara_get_guide":
      return record.found
        ? { kind: "guide", data: record, title: "راهنمای گام‌به‌گام" }
        : null;
    case "liara_verify_project":
      return {
        kind: "verification",
        data: record,
        title: "بررسی نتیجه",
      };
    case "liara_wait_release":
      return {
        kind: "release",
        data: record,
        title: "وضعیت استقرار",
      };
    case "liara_list_domains":
      return { kind: "domain", data: record, title: "دامنه‌ها" };
    case "liara_list_vms":
      return { kind: "vms", data: record, title: "سرورهای مجازی" };
    case "liara_list_databases":
      return { kind: "databases", data: record, title: "دیتابیس‌ها" };
    case "liara_app_releases":
      return { kind: "release", data: record, title: "تاریخچه‌ی استقرار" };
    default:
      return null;
  }
}

function truncateToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[نتیجه به دلیل حجم زیاد کوتاه شد]`;
}

function short(value: string): string {
  const clean = redactText(value).replace(/\s+/g, " ").trim();
  return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
}

function friendlyAgentError(error: unknown): string {
  const message = safeError(error);
  if (/401|unauthorized|invalid.*key/i.test(message)) {
    return "کلید مدل زبانی معتبر نیست. مقدار LLM_API_KEY را در .env بررسی کن.";
  }
  if (/429|rate limit/i.test(message)) {
    return "سرویس مدل زبانی فعلاً محدودیت درخواست دارد. چند لحظه بعد دوباره تلاش کن.";
  }
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
    return "ارتباط با سرویس مدل زبانی یا لیارا برقرار نشد. اتصال شبکه را بررسی کن.";
  }
  return `در پردازش درخواست خطایی رخ داد: ${short(message)}`;
}
