import { LiaraClient, projectUrl } from "@/lib/liara/client";
import { getConfig } from "@/lib/config";
import { diagnose } from "@/lib/liara/diagnostics";
import { safeError } from "@/lib/security/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  try {
    const config = getConfig();
    const client = new LiaraClient({
      apiKey: config.liaraApiKey,
      teamId: config.liaraTeamId,
    });
    const project = await client.getProject(name);
    const [plans, history, applets, logs, metrics, domains] =
      await Promise.all([
        client.getPlanData(),
        client.listReleases(name, 5).catch(() => ({ releases: [] })),
        client.listApplets(name).catch(() => []),
        client
          .listLogs(name, { sinceSeconds: 15 * 60, limit: 300 })
          .catch(() => []),
        client.getFullMetrics(name, 3 * 3600).catch(() => ({
          cpu: [],
          memory: [],
          networkReceive: [],
          networkTransmit: [],
          disks: [],
        })),
        client.listDomains(name).catch(() => []),
      ]);
    const plan = plans.projects.find((p) => p.id === project.planID) ?? null;
    const diagnosis = diagnose({
      project,
      plan: plan ?? undefined,
      releases: history.releases,
      applets,
      logs,
      metrics,
      domains,
    });
    return Response.json({
      project: {
        ...project,
        raw: undefined,
        envs: project.envs.map((env) => ({
          key: env.key,
          encrypted: env.encrypted,
          maskedValue: "••••••••",
        })),
        url: projectUrl(project),
      },
      plan,
      bundle:
        plans.bundles.find(
          (b) =>
            b.planID === project.planID &&
            b.bundleID === project.bundlePlanID,
        ) ?? null,
      latestRelease: history.releases[0] ?? null,
      releases: history.releases,
      domains,
      diagnosis,
      metrics: {
        signals: diagnosis.signals,
        disks: metrics.disks,
      },
    });
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 500 });
  }
}
