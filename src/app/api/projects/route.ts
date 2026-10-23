import { LiaraClient } from "@/lib/liara/client";
import { getConfig } from "@/lib/config";
import { safeError } from "@/lib/security/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getConfig();
    const client = new LiaraClient({
      apiKey: config.liaraApiKey,
      teamId: config.liaraTeamId,
    });
    const [account, projects, plans] = await Promise.all([
      client.getAccountSummary(),
      client.listProjects(),
      client.getPlanData(),
    ]);
    return Response.json({
      account,
      projects: projects.map((project) => {
        const plan = plans.projects.find((p) => p.id === project.planID) ?? null;
        return {
          ...project,
          plan,
          url: project.scale > 0 ? projectUrlFromName(project.name) : "",
          health:
            project.scale === 0
              ? "stopped"
              : project.isDeployed
                ? "deployed"
                : "not_deployed",
        };
      }),
    });
  } catch (error) {
    return Response.json(
      { error: safeError(error), projects: [], account: null },
      { status: 500 },
    );
  }
}

function projectUrlFromName(name: string): string {
  return `https://${name}.iran.liara.run`;
}

