import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLiaraMcpServer } from "./server";

export type McpConnection = {
  client: Client;
  close: () => Promise<void>;
};

export async function connectMcp(): Promise<McpConnection> {
  const server = createLiaraMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "raahbar-agent", version: "0.1.0" },
    { capabilities: {} },
  );
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async () => {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    },
  };
}

export type McpToolResult = {
  ok: boolean;
  text: string;
  raw: unknown;
  isError: boolean;
};

export async function callMcpTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResult> {
  const result = await client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter(
      (item): item is { type: "text"; text: string } =>
        Boolean(item) &&
        typeof item === "object" &&
        (item as { type?: string }).type === "text",
    )
    .map((item) => item.text)
    .join("\n");
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  const isError = Boolean(
    (result as { isError?: boolean }).isError ||
      (parsed &&
        typeof parsed === "object" &&
        (parsed as { ok?: boolean }).ok === false &&
        "error" in (parsed as Record<string, unknown>)),
  );
  return {
    ok: !isError,
    text,
    raw: parsed,
    isError,
  };
}

export function toolDisplayName(name: string): string {
  const names: Record<string, string> = {
    liara_account: "بررسی حساب لیارا",
    liara_list_projects: "خواندن پروژه‌ها",
    liara_get_project: "بررسی پروژه",
    liara_list_plans: "خواندن پلن‌ها",
    liara_recommend_plan: "انتخاب پلن مناسب",
    liara_app_logs: "خواندن لاگ‌ها",
    liara_app_metrics: "خواندن متریک‌ها",
    liara_app_releases: "بررسی استقرارها",
    liara_app_events: "خواندن رویدادها",
    liara_diagnose_app: "عیب‌یابی برنامه",
    liara_verify_project: "بررسی نتیجه",
    liara_wait_release: "دنبال‌کردن استقرار",
    liara_list_domains: "بررسی دامنه‌ها",
    liara_check_domain: "بررسی وضعیت دامنه",
    liara_list_vms: "خواندن سرورها",
    liara_vm_plans: "خواندن پلن‌های سرور",
    liara_vm_os: "خواندن سیستم‌عامل‌ها",
    liara_list_databases: "خواندن دیتابیس‌ها",
    liara_get_guide: "خواندن راهنما",
    liara_list_guides: "فهرست راهنماها",
    liara_prepare_action: "آماده‌سازی اقدام",
    liara_apply_action: "اجرای اقدام تأییدشده",
    liara_action_status: "وضعیت تأیید",
    liara_cancel_action: "لغو اقدام",
  };
  return names[name] ?? name;
}
