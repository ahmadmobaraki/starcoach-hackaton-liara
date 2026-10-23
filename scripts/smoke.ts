import "dotenv/config";
import { callMcpTool, connectMcp } from "@/lib/mcp/client";

async function main() {
  const mcp = await connectMcp();
  try {
    const tools = await mcp.client.listTools();
    console.log(`MCP tools: ${tools.tools.length}`);
    console.log(tools.tools.map((tool) => tool.name).join(", "));

    const account = await callMcpTool(mcp.client, "liara_account", {});
    console.log("\nAccount:", account.ok ? "ok" : "error");
    console.log(account.text.slice(0, 800));

    const projects = await callMcpTool(mcp.client, "liara_list_projects", {});
    console.log("\nProjects:", projects.ok ? "ok" : "error");
    console.log(projects.text.slice(0, 800));

    const plans = await callMcpTool(mcp.client, "liara_recommend_plan", {
      framework: "next",
      traffic: "medium",
      hasDatabase: false,
      budgetMonthlyToman: 2_000_000,
    });
    console.log("\nPlan recommendation:", plans.ok ? "ok" : "error");
    console.log(plans.text.slice(0, 1800));

    const vmPlans = await callMcpTool(mcp.client, "liara_vm_plans", {});
    console.log("\nVM plans:", vmPlans.ok ? "ok" : "error");
    console.log(vmPlans.text.slice(0, 700));

    const vmOs = await callMcpTool(mcp.client, "liara_vm_os", {});
    console.log("\nVM OS:", vmOs.ok ? "ok" : "error");
    console.log(vmOs.text.slice(0, 400));

    const guide = await callMcpTool(mcp.client, "liara_get_guide", {
      topic: "domain-irnic",
    });
    console.log("\nGuide:", guide.ok ? "ok" : "error");
    console.log(guide.text.slice(0, 500));

    const prepared = await callMcpTool(mcp.client, "liara_prepare_action", {
      action: "create_app",
      params: {
        name: "raahbar-smoke-test",
        platform: "next",
        planID: "small-g2",
        bundlePlanID: "standard",
      },
      reason: "smoke-test only; not approved",
    });
    console.log("\nPrepare action:", prepared.ok ? "ok" : "error");
    console.log(prepared.text.slice(0, 1200));
    if (prepared.raw && typeof prepared.raw === "object") {
      const approvalId = (prepared.raw as { approvalId?: string }).approvalId;
      if (approvalId) {
        const canceled = await callMcpTool(mcp.client, "liara_cancel_action", {
          approvalId,
        });
        console.log("\nCanceled:", canceled.ok ? "ok" : "error");
      }
    }
  } finally {
    await mcp.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
