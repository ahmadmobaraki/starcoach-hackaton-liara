import { describe, expect, it, vi } from "vitest";
import {
  applyAction,
  prepareAction,
} from "@/lib/mcp/actions";
import type { LiaraClient } from "@/lib/liara/client";
import { decideApproval, getApproval } from "@/lib/security/approvals";

function fakeClient() {
  const getProject = vi.fn().mockResolvedValue({
    id: "p1",
    name: "demo",
    type: "next",
    status: "RUNNING",
    scale: 1,
    planID: "small-g2",
    isDeployed: true,
    envs: [],
  });
  const restartProject = vi.fn().mockResolvedValue(undefined);
  return {
    client: { getProject, restartProject } as unknown as LiaraClient,
    getProject,
    restartProject,
  };
}

describe("two-phase approvals", () => {
  it("does not execute a mutation before human approval", async () => {
    const { client, restartProject } = fakeClient();
    const prepared = await prepareAction(client, {
      action: "restart_app",
      params: { app: "demo" },
      reason: "test",
    });
    expect(prepared.status).toBe("AWAITING_APPROVAL");
    expect(prepared.preview.risk).toBe("medium");

    const pending = await applyAction(client, {
      approvalId: prepared.approvalId,
      digest: prepared.digest,
    });
    expect(pending.status).toBe("AWAITING_APPROVAL");
    expect(restartProject).not.toHaveBeenCalled();
  });

  it("executes exactly once after approval", async () => {
    const { client, restartProject } = fakeClient();
    const prepared = await prepareAction(client, {
      action: "restart_app",
      params: { app: "demo" },
    });
    await decideApproval(prepared.approvalId, "approve");

    const executed = await applyAction(client, {
      approvalId: prepared.approvalId,
      digest: prepared.digest,
    });
    expect(executed.status).toBe("executed");
    expect(restartProject).toHaveBeenCalledTimes(1);

    const again = await applyAction(client, {
      approvalId: prepared.approvalId,
      digest: prepared.digest,
    });
    expect(again.status).toBe("already_executed");
    expect(restartProject).toHaveBeenCalledTimes(1);
  });

  it("rejects a digest mismatch", async () => {
    const { client } = fakeClient();
    const prepared = await prepareAction(client, {
      action: "restart_app",
      params: { app: "demo" },
    });
    await decideApproval(prepared.approvalId, "approve");
    await expect(
      applyAction(client, {
        approvalId: prepared.approvalId,
        digest: "bad-digest",
      }),
    ).rejects.toThrow(/مطابقت/);
  });

  it("requires typing the resource name for critical actions", async () => {
    const { client } = fakeClient();
    const prepared = await prepareAction(client, {
      action: "delete_app",
      params: { name: "demo" },
    });
    expect(prepared.preview.risk).toBe("critical");
    expect(prepared.preview.confirmTextRequired).toBe("demo");

    await expect(
      decideApproval(prepared.approvalId, "approve"),
    ).rejects.toThrow(/نام منبع/);

    const approved = await decideApproval(
      prepared.approvalId,
      "approve",
      "demo",
    );
    expect(approved.status).toBe("approved");
    const record = await getApproval(prepared.approvalId);
    expect(record?.status).toBe("approved");
    expect(record).not.toHaveProperty("paramsEnc");
  });

  it("records a rejection and prevents execution", async () => {
    const { client } = fakeClient();
    const prepared = await prepareAction(client, {
      action: "restart_app",
      params: { app: "demo" },
    });
    await decideApproval(prepared.approvalId, "reject");
    await expect(
      applyAction(client, {
        approvalId: prepared.approvalId,
        digest: prepared.digest,
      }),
    ).rejects.toThrow(/رد/);
  });
});
