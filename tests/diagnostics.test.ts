import { describe, expect, it } from "vitest";
import { diagnose } from "@/lib/liara/diagnostics";
import type {
  LiaraPlan,
  LogEntry,
  MetricsSummary,
  ProjectDetail,
} from "@/lib/liara/types";

const plan: LiaraPlan = {
  id: "small-g2",
  available: true,
  cpu: 1,
  ram: 1,
  disk: 10,
  monthlyPrice: 475000,
  hourlyPrice: 659,
};

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    name: "demo",
    type: "next",
    status: "RUNNING",
    scale: 1,
    planID: "small-g2",
    isDeployed: true,
    envs: [],
    ...overrides,
  };
}

function metrics(overrides: Partial<MetricsSummary> = {}): MetricsSummary {
  return {
    cpu: [
      { timestamp: 1, value: 0.1 },
      { timestamp: 2, value: 0.2 },
    ],
    memory: [
      { timestamp: 1, value: 200 },
      { timestamp: 2, value: 300 },
    ],
    networkReceive: [],
    networkTransmit: [],
    disks: [{ name: "disk", size: "10 GB", usage: "2 GB" }],
    ...overrides,
  };
}

function log(message: string): LogEntry {
  return { timestamp: new Date().toISOString(), message };
}

describe("diagnose", () => {
  it("detects a stopped app as critical", () => {
    const result = diagnose({
      project: project({ scale: 0 }),
      plan,
      releases: [],
      applets: [],
      logs: [],
      metrics: metrics(),
      domains: [],
    });
    expect(result.severity).toBe("critical");
    expect(result.findings[0]?.id).toBe("app_stopped");
  });

  it("detects OOM evidence and memory pressure", () => {
    const result = diagnose({
      project: project(),
      plan,
      releases: [
        {
          id: "r1",
          state: "READY",
          createdAt: new Date().toISOString(),
        },
      ],
      applets: [],
      logs: [
        log("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"),
        log("GET /api 500 Internal Server Error"),
      ],
      metrics: metrics({
        memory: [
          { timestamp: 1, value: 900 },
          { timestamp: 2, value: 980 },
        ],
      }),
      domains: [],
    });
    expect(result.findings.some((finding) => finding.id === "oom_signal")).toBe(true);
    expect(result.findings.some((finding) => finding.id === "memory_pressure")).toBe(true);
    expect(result.signals.memoryPercent).toBeGreaterThanOrEqual(85);
  });

  it("detects a failed release", () => {
    const result = diagnose({
      project: project(),
      plan,
      releases: [
        {
          id: "r1",
          state: "FAILED",
          failReason: "build failed",
        },
      ],
      applets: [],
      logs: [],
      metrics: metrics(),
      domains: [],
    });
    expect(result.findings.some((finding) => finding.id === "release_failed")).toBe(true);
  });

  it("returns healthy when there is no evidence of a problem", () => {
    const result = diagnose({
      project: project(),
      plan,
      releases: [{ id: "r1", state: "READY" }],
      applets: [],
      logs: [log("GET / 200 12ms"), log("GET /api/health 200 4ms")],
      metrics: metrics(),
      domains: [],
    });
    expect(result.severity).toBe("healthy");
    expect(result.findings[0]?.id).toBe("healthy");
  });

  it("detects unhealthy applets", () => {
    const result = diagnose({
      project: project(),
      plan,
      releases: [{ id: "r1", state: "READY" }],
      applets: [
        {
          id: "a1",
          name: "demo",
          state: "FAILED",
          reason: "health check failed",
        },
      ],
      logs: [],
      metrics: metrics(),
      domains: [],
    });
    expect(result.findings.some((finding) => finding.id === "applet_unhealthy")).toBe(true);
  });

  it("detects database connection errors", () => {
    const result = diagnose({
      project: project(),
      plan,
      releases: [{ id: "r1", state: "READY" }],
      applets: [],
      logs: [log("Error: connect ECONNREFUSED 10.0.0.5:5432")],
      metrics: metrics(),
      domains: [],
    });
    expect(
      result.findings.some((finding) => finding.id === "database_connectivity"),
    ).toBe(true);
  });
});
