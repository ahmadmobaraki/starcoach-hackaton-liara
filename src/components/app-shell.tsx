"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  MessageSquarePlus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { AgentEvent } from "@/lib/agent/events";
import type {
  Artifact,
  PendingApproval,
  Session,
  ToolTrace,
  UiMessage,
} from "@/lib/agent/types";
import type { AccountLite, ProjectHealth, ProjectLite } from "@/components/types";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileHeader } from "@/components/shell/mobile-header";
import { Welcome } from "@/components/chat/welcome";
import { Composer } from "@/components/chat/composer";
import { MessageItem } from "@/components/chat/message-item";
import { LiveMessage } from "@/components/chat/message-item";
import { ApprovalCard } from "@/components/cards/approval-card";
import { DeployRail } from "@/components/deploy-rail";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Toast, type ToastState } from "@/components/ui/toast";

type StreamEvent = AgentEvent;

type StatusConfig = {
  llmModel?: string;
  hasLiara?: boolean;
  hasLlm?: boolean;
};

export function AppShell() {
  const [account, setAccount] = useState<AccountLite | null>(null);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<string | undefined>();
  const [health, setHealth] = useState<ProjectHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthNonce, setHealthNonce] = useState(0);
  const [config, setConfig] = useState<StatusConfig>({});
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const [liveTools, setLiveTools] = useState<ToolTrace[]>([]);
  const [liveArtifactIds, setLiveArtifactIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToastState] = useState<ToastState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [approvalSource, setApprovalSource] = useState<"panel" | "mcp">("panel");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string, tone: ToastState["tone"] = "info") => {
    setToastState({ id: Date.now(), message, tone });
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as {
        account?: AccountLite;
        projects?: ProjectLite[];
      };
      setAccount(data.account ?? null);
      setProjects(data.projects ?? []);
      if (!activeProject && data.projects?.[0]?.name) {
        setActiveProject(data.projects[0].name);
        localStorage.setItem("raahbar:project", data.projects[0].name);
      }
    } catch {
      // Keep the last known project list.
    }
  }, [activeProject]);

  const loadSessionById = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/session?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return false;
      const data = (await response.json()) as {
        session: Session | null;
      };
      if (!data.session) return false;
      setSessionId(data.session.id);
      setMessages(data.session.messages ?? []);
      setArtifacts(data.session.artifacts ?? []);
      if (!new URLSearchParams(window.location.search).has("approval")) {
        setPending(data.session.pending ?? null);
      }
      if (data.session.activeProject) setActiveProject(data.session.activeProject);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [projectsResponse, statusResponse] = await Promise.all([
          fetch("/api/projects", { cache: "no-store" }),
          fetch("/api/status", { cache: "no-store" }),
        ]);
        const projectsData = (await projectsResponse.json()) as {
          account?: AccountLite;
          projects?: ProjectLite[];
          error?: string;
        };
        const statusData = (await statusResponse.json()) as StatusConfig;
        if (cancelled) return;
        setConfig(statusData);
        if (!projectsResponse.ok) {
          setError(projectsData.error ?? "خواندن پروژه‌های لیارا ناموفق بود.");
          return;
        }
        setAccount(projectsData.account ?? null);
        setProjects(projectsData.projects ?? []);
        const storedProject = localStorage.getItem("raahbar:project");
        const chosen =
          (storedProject &&
            projectsData.projects?.some((p) => p.name === storedProject) &&
            storedProject) ||
          projectsData.projects?.[0]?.name;
        if (chosen) {
          setActiveProject(chosen);
          localStorage.setItem("raahbar:project", chosen);
        }
        const querySession = new URLSearchParams(window.location.search).get(
          "session",
        );
        const storedSession =
          querySession ?? localStorage.getItem("raahbar:session");
        if (querySession) localStorage.setItem("raahbar:session", querySession);
        if (storedSession) {
          await loadSessionById(storedSession);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "اتصال به سرور برقرار نشد.",
          );
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessionById]);

  useEffect(() => {
    const approvalId = new URLSearchParams(window.location.search).get("approval");
    if (!approvalId) return;
    void (async () => {
      try {
        const response = await fetch(
          `/api/approvals/${encodeURIComponent(approvalId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          approval?: {
            approvalId?: string;
            id?: string;
            digest: string;
            action: string;
            preview: PendingApproval["preview"];
            expiresAt: string;
            createdAt: string;
          };
        };
        if (data.approval) {
          setPending({
            approvalId: data.approval.id ?? data.approval.approvalId ?? approvalId,
            digest: data.approval.digest,
            action: data.approval.action,
            preview: data.approval.preview,
            createdAt: data.approval.createdAt,
            expiresAt: data.approval.expiresAt,
          });
          setApprovalSource("mcp");
        }
      } catch {
        // The approval page is optional; ignore failures.
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeProject) {
      setHealth(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setHealthLoading(true);
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(activeProject)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as ProjectHealth & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setHealth(null);
          return;
        }
        setHealth(data);
      } catch {
        if (!cancelled) setHealth(null);
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeProject, healthNonce]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const hasContent =
      messages.length > 0 || Boolean(liveText) || liveTools.length > 0 || Boolean(pending);
    node.scrollTo({
      top: hasContent ? node.scrollHeight : 0,
      behavior: "auto",
    });
  }, [messages.length, liveText, liveTools.length, pending]);

  const mergedMessages = useMemo(
    () => mergeAssistantMessages(messages),
    [messages],
  );
  const artifactsById = useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact])),
    [artifacts],
  );
  const liveArtifacts = useMemo(
    () =>
      liveArtifactIds
        .map((id) => artifactsById.get(id))
        .filter((artifact): artifact is Artifact => Boolean(artifact)),
    [artifactsById, liveArtifactIds],
  );

  const sendMessage = useCallback(
    async (text?: string, options?: { resume?: boolean; context?: string }) => {
      if (streaming) return;
      const value = text?.trim() ?? "";
      if (!options?.resume && !value) return;

      setError(null);
      setApprovalResult(null);
      setStreaming(true);
      setStatusLabel("در حال ارسال...");
      setLiveText("");
      setLiveTools([]);
      setLiveArtifactIds([]);

      if (!options?.resume) {
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            role: "user",
            content: value,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let currentSessionId = sessionId;
      let receivedDone = false;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: value || undefined,
            context: options?.context,
            project: activeProject,
            resume: Boolean(options?.resume),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? "درخواست به سرور نرسید.");
        }

        await consumeSse(response, (event) => {
          switch (event.type) {
            case "meta":
              currentSessionId = event.sessionId;
              setSessionId(event.sessionId);
              localStorage.setItem("raahbar:session", event.sessionId);
              break;
            case "status":
              setStatusLabel(event.label);
              break;
            case "text":
              setStatusLabel(null);
              setLiveText((prev) => prev + event.delta);
              break;
            case "tool_start":
              setStatusLabel(`در حال اجرای ${event.displayName}...`);
              setLiveTools((prev) => [
                ...prev.filter((tool) => tool.id !== event.id),
                {
                  id: event.id,
                  name: event.name,
                  displayName: event.displayName,
                  status: "running",
                },
              ]);
              break;
            case "tool_result":
              setLiveTools((prev) =>
                prev.map((tool) =>
                  tool.id === event.id
                    ? {
                        ...tool,
                        status: event.ok ? "ok" : "error",
                        summary: event.summary,
                        durationMs: event.durationMs,
                      }
                    : tool,
                ),
              );
              break;
            case "artifact":
              setArtifacts((prev) => {
                if (prev.some((artifact) => artifact.id === event.artifactId)) {
                  return prev;
                }
                return [
                  ...prev,
                  {
                    id: event.artifactId,
                    kind: event.kind,
                    data: event.data,
                    createdAt: new Date().toISOString(),
                  },
                ];
              });
              setLiveArtifactIds((prev) =>
                prev.includes(event.artifactId)
                  ? prev
                  : [...prev, event.artifactId],
              );
              break;
            case "approval":
              setPending({
                approvalId: event.approvalId,
                digest: event.digest,
                action: event.action,
                preview: event.preview as PendingApproval["preview"],
                createdAt: new Date().toISOString(),
                expiresAt: event.expiresAt,
              });
              setStatusLabel(null);
              break;
            case "error":
              setError(event.message);
              break;
            case "done":
              receivedDone = true;
              setStatusLabel(null);
              break;
            default:
              break;
          }
        });
      } catch (caught) {
        if ((caught as Error).name === "AbortError") {
          notify("درخواست متوقف شد.", "info");
        } else {
          setError(
            caught instanceof Error ? caught.message : "پردازش درخواست ناموفق بود.",
          );
        }
      } finally {
        setStreaming(false);
        setStatusLabel(null);
        abortRef.current = null;
        if (currentSessionId && receivedDone) {
          void refreshProjects();
          const loaded = await loadSessionById(currentSessionId);
          if (loaded) {
            setLiveText("");
            setLiveTools([]);
            setLiveArtifactIds([]);
          }
        }
      }
    },
    [activeProject, loadSessionById, notify, refreshProjects, sessionId, streaming],
  );

  const handleApproval = useCallback(
    async (decision: "approve" | "reject", confirmText?: string) => {
      if (!pending || approvalBusy) return;
      setApprovalBusy(true);
      setApprovalResult(null);
      try {
        const response = await fetch(
          `/api/approvals/${encodeURIComponent(pending.approvalId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision, confirmText }),
          },
        );
        const data = (await response.json()) as {
          error?: string;
          decision?: string;
          result?: unknown;
        };
        if (!response.ok) {
          throw new Error(data.error ?? "ثبت تصمیم ناموفق بود.");
        }
        if (approvalSource === "panel" || !data.error) {
          setPending(null);
        }
        void refreshProjects();
        if (decision === "reject") {
          setApprovalResult({
            ok: true,
            message: "اقدام لغو شد؛ هیچ تغییری اعمال نشد.",
          });
          notify("اقدام لغو شد.", "info");
        } else if (data.error) {
          setApprovalResult({ ok: false, message: data.error });
          notify("اجرای اقدام با خطا مواجه شد.", "error");
        } else {
          setApprovalResult({
            ok: true,
            message: "اقدام تأیید و اجرا شد. نتیجه را بررسی می‌کنم...",
          });
          notify("اقدام اجرا شد؛ در حال بررسی نتیجه...", "success");
        }
        if (approvalSource === "panel" && sessionId) {
          await sendMessage(undefined, { resume: true });
        } else {
          notify("تأیید ثبت شد؛ نتیجه به کلاینت MCP برگردانده می‌شود.", "info");
        }
      } catch (caught) {
        setApprovalResult({
          ok: false,
          message:
            caught instanceof Error ? caught.message : "ثبت تصمیم ناموفق بود.",
        });
        setError(caught instanceof Error ? caught.message : "خطای نامشخص");
      } finally {
        setApprovalBusy(false);
      }
    },
    [approvalBusy, approvalSource, notify, pending, refreshProjects, sendMessage, sessionId],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/sources", {
          method: "POST",
          body: form,
        });
        const data = (await response.json()) as {
          upload?: {
            id: string;
            filename: string;
            platform: string;
            size: number;
            fileCount: number;
          };
          detectedPlatform?: string;
          error?: string;
        };
        if (!response.ok || !data.upload) {
          throw new Error(data.error ?? "آپلود فایل ناموفق بود.");
        }
        notify(
          `فایل آماده شد (${data.detectedPlatform ?? data.upload.platform})`,
          "success",
        );
        setUploading(false);
        void sendMessage(
          `فایل پروژه را آپلود کردم: ${data.upload.filename} (${
            data.detectedPlatform ?? data.upload.platform
          }). برای ساخت برنامه و استقرار ادامه بده.`,
          {
            context: `sourceUploadId=${data.upload.id}; filename=${data.upload.filename}; platform=${
              data.detectedPlatform ?? data.upload.platform
            }; size=${data.upload.size}; fileCount=${data.upload.fileCount}`,
          },
        );
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "آپلود فایل ناموفق بود.";
        setError(message);
        notify(message, "error");
      } finally {
        setUploading(false);
      }
    },
    [notify, sendMessage, uploading],
  );

  const selectProject = (name: string) => {
    setActiveProject(name);
    localStorage.setItem("raahbar:project", name);
    setHealth(null);
    setSidebarOpen(false);
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    localStorage.removeItem("raahbar:session");
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    setSessionId(undefined);
    setMessages([]);
    setArtifacts([]);
    setPending(null);
    setLiveText("");
    setLiveTools([]);
    setLiveArtifactIds([]);
    setError(null);
    setApprovalResult(null);
    setStatusLabel(null);
    notify("گفت‌وگوی جدید آماده است.", "info");
  };

  const activeProjectName = activeProject ?? health?.project?.name;
  const showDeployRail = Boolean(
    (pending && ["create_app", "deploy_source"].includes(pending.action)) ||
      liveTools.some((tool) =>
        ["liara_prepare_action", "liara_wait_release", "liara_verify_project"].includes(
          tool.name,
        ),
      ) ||
      (health?.project?.isDeployed && health?.latestRelease?.state !== "READY"),
  );
  const hasMessages =
    messages.length > 0 || Boolean(liveText) || liveTools.length > 0;

  return (
    <div className="min-h-dvh bg-bg">
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.tar,.tar.gz,.tgz"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      <MobileHeader
        activeProject={activeProjectName}
        projects={projects}
        onMenu={() => setSidebarOpen(true)}
      />

      <div className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-[1440px] lg:min-h-dvh">
        <Sidebar
          className="sticky top-0 hidden lg:flex"
          account={account}
          projects={projects}
          activeProject={activeProjectName}
          health={health}
          healthLoading={healthLoading}
          onSelectProject={selectProject}
          onRefresh={() => setHealthNonce((value) => value + 1)}
          onPrompt={(prompt) => void sendMessage(prompt)}
          onPickFile={() => fileRef.current?.click()}
          model={config.llmModel}
          mcpConnected={Boolean(config.hasLiara && config.hasLlm)}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex h-[calc(100dvh-56px)] w-full max-w-[900px] flex-col px-3 sm:px-6 lg:h-dvh">
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line/70 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-bold">
                      {activeProjectName ?? "گفت‌وگو با راهبر"}
                    </span>
                    {activeProjectName ? (
                      <span className="size-1.5 rounded-full bg-success" />
                    ) : null}
                  </div>
                  <div className="text-[9.5px] text-muted">
                    {projectsLoading
                      ? "در حال اتصال به لیارا..."
                      : activeProjectName
                        ? "دستیار آماده‌ی بررسی و اجراست"
                        : "برای شروع، یک درخواست بنویس"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone="accent" className="hidden sm:inline-flex">
                  <ShieldCheck className="size-3" />
                  تأیید انسانی
                </Badge>
                <button
                  type="button"
                  onClick={() => setHealthNonce((value) => value + 1)}
                  className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                  aria-label="به‌روزرسانی وضعیت"
                  title="به‌روزرسانی وضعیت"
                >
                  {healthLoading ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink"
                  aria-label="گفت‌وگوی جدید"
                  title="گفت‌وگوی جدید"
                >
                  <MessageSquarePlus className="size-3.5" />
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className={`flex-1 overflow-y-auto px-1 pb-4 pt-4 no-scrollbar sm:px-2 ${
                !hasMessages && !pending ? "flex flex-col sm:justify-center" : ""
              }`}
            >
              {!hasMessages && !pending ? (
                <Welcome
                  account={account}
                  hasProjects={projects.length > 0}
                  activeProject={activeProjectName}
                  onPrompt={(prompt) => void sendMessage(prompt)}
                  onPickFile={() => fileRef.current?.click()}
                  uploading={uploading}
                />
              ) : null}

              <div className="space-y-4 sm:space-y-5">
                {mergedMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    artifactsById={artifactsById}
                    onPrompt={(prompt) => void sendMessage(prompt)}
                  />
                ))}

                {streaming || liveText || liveTools.length ? (
                  <LiveMessage
                    text={liveText}
                    tools={liveTools}
                    artifacts={liveArtifacts}
                    status={statusLabel}
                    onPrompt={(prompt) => void sendMessage(prompt)}
                  />
                ) : null}

                {pending ? (
                  <ApprovalCard
                    pending={pending}
                    busy={approvalBusy}
                    result={approvalResult}
                    onDecision={(decision, confirmText) =>
                      void handleApproval(decision, confirmText)
                    }
                  />
                ) : null}
              </div>
            </div>

            <div className="shrink-0 pb-[max(8px,env(safe-area-inset-bottom))] pt-1">
              {error ? (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft/60 px-3 py-2 text-[11px] leading-5 text-danger">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="text-[10px] font-medium underline"
                  >
                    بستن
                  </button>
                </div>
              ) : null}

              <DeployRail
                visible={showDeployRail}
                pending={pending}
                tools={liveTools}
                artifacts={artifacts}
                isDeployed={health?.project?.isDeployed}
              />

              <Composer
                onSend={(text) => void sendMessage(text)}
                onStop={() => abortRef.current?.abort()}
                onUpload={(file) => void handleUpload(file)}
                disabled={streaming}
                streaming={streaming}
                uploading={uploading}
                activeProject={activeProjectName}
              />

              <div className="mt-2 flex items-center justify-center gap-1.5 text-[9.5px] text-muted/80">
                <Sparkles className="size-2.5" />
                راهبر ممکن است اشتباه کند؛ قبل از اقدام حساس، پیش‌نمایش را بررسی کن.
              </div>
            </div>
          </div>
        </main>
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
            aria-label="بستن منو"
          />
          <div className="absolute inset-y-0 right-0 animate-enter shadow-[var(--shadow-float)]">
            <Sidebar
              account={account}
              projects={projects}
              activeProject={activeProjectName}
              health={health}
              healthLoading={healthLoading}
              onSelectProject={selectProject}
              onRefresh={() => setHealthNonce((value) => value + 1)}
              onPrompt={(prompt) => {
                setSidebarOpen(false);
                void sendMessage(prompt);
              }}
              onPickFile={() => {
                setSidebarOpen(false);
                fileRef.current?.click();
              }}
              onClose={() => setSidebarOpen(false)}
              model={config.llmModel}
              mcpConnected={Boolean(config.hasLiara && config.hasLlm)}
            />
          </div>
        </div>
      ) : null}

      <Toast toast={toast} onClose={() => setToastState(null)} />
    </div>
  );
}

function mergeAssistantMessages(messages: UiMessage[]): UiMessage[] {
  const result: UiMessage[] = [];
  let pending: UiMessage | null = null;

  for (const message of messages) {
    const toolOnly =
      message.role === "assistant" &&
      !message.content.trim() &&
      ((message.tools?.length ?? 0) > 0 ||
        (message.artifactIds?.length ?? 0) > 0);

    if (toolOnly) {
      if (pending) {
        const current: UiMessage = pending;
        pending = {
          ...current,
          tools: [...(current.tools ?? []), ...(message.tools ?? [])],
          artifactIds: [
            ...(current.artifactIds ?? []),
            ...(message.artifactIds ?? []),
          ],
        };
      } else {
        pending = { ...message };
      }
      continue;
    }

    if (message.role === "assistant" && pending) {
      result.push({
        ...message,
        tools: [...(pending.tools ?? []), ...(message.tools ?? [])],
        artifactIds: [
          ...(pending.artifactIds ?? []),
          ...(message.artifactIds ?? []),
        ],
      });
      pending = null;
      continue;
    }

    if (pending) {
      result.push(pending);
      pending = null;
    }
    result.push(message);
  }

  if (pending) result.push(pending);
  return result;
}

async function consumeSse(
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("پاسخ سرور قابل خواندن نیست.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const raw = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = parseSse(raw);
      if (event) onEvent(event);
      index = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    const event = parseSse(buffer);
    if (event) onEvent(event);
  }
}

function parseSse(raw: string): StreamEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join("\n")) as StreamEvent;
    return parsed ?? (eventName ? ({ type: eventName } as StreamEvent) : null);
  } catch {
    return null;
  }
}
