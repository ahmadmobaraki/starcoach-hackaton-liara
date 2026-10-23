import { describe, expect, it } from "vitest";
import { recommendPlan } from "@/lib/liara/plan-advisor";
import type { BundlePlan, LiaraPlan } from "@/lib/liara/types";

const plans: LiaraPlan[] = [
  {
    id: "small-g2",
    available: true,
    region: "iran",
    cpu: 0.5,
    ram: 0.5,
    disk: 5,
    monthlyPrice: 475000,
    hourlyPrice: 659,
  },
  {
    id: "medium-g2",
    available: true,
    region: "iran",
    cpu: 1,
    ram: 1,
    disk: 10,
    monthlyPrice: 825000,
    hourlyPrice: 1145,
  },
  {
    id: "standard-base-g2",
    available: true,
    region: "iran",
    cpu: 1,
    ram: 2,
    disk: 20,
    monthlyPrice: 1475000,
    hourlyPrice: 2048,
  },
  {
    id: "standard-plus-g2",
    available: true,
    region: "iran",
    cpu: 2,
    ram: 4,
    disk: 40,
    monthlyPrice: 2650000,
    hourlyPrice: 3680,
  },
  {
    id: "legacy-medium",
    available: true,
    region: "iran",
    cpu: 1,
    ram: 2,
    disk: 20,
    monthlyPrice: 2949998,
    hourlyPrice: 4097,
  },
];

function bundle(planID: string, bundleID: string, monthly: number, hourly: number): BundlePlan {
  return {
    id: `${planID}:${bundleID}`,
    planID,
    bundleID,
    available: true,
    monthlyPrice: monthly,
    hourlyPrice: hourly,
    buildTimeoutMinutes: 15,
    maxLogsRetentionDays: 30,
    maxReportRetentionDays: 30,
    maxDomains: 5,
    maxDeploymentsPerDay: 50,
    zeroDowntime: true,
    rollback: true,
    maxSourceSizeMb: 256,
    maxDiskPerProject: 5,
  };
}

const bundles = [
  bundle("small-g2", "standard", 475000, 659),
  bundle("medium-g2", "standard", 825000, 1145),
  bundle("standard-base-g2", "standard", 1475000, 2048),
  bundle("standard-plus-g2", "standard", 2650000, 3680),
  bundle("legacy-medium", "standard", 0, 0),
];

describe("recommendPlan", () => {
  it("uses the bundle price as the total, not plan+bundle", () => {
    const result = recommendPlan(
      {
        framework: "next",
        traffic: "medium",
        budgetMonthlyToman: 2_000_000,
      },
      plans,
      bundles,
    );
    expect(result.recommended.plan.id).toBe("standard-base-g2");
    expect(result.recommended.totalMonthlyToman).toBe(1475000);
    expect(result.recommended.fitsBudget).toBe(true);
  });

  it("ignores legacy plans and keeps current g2 options", () => {
    const result = recommendPlan(
      { framework: "next", traffic: "medium" },
      plans,
      bundles,
    );
    expect(result.recommended.plan.id).not.toBe("legacy-medium");
    expect(result.alternatives.some((option) => option.plan.id === "legacy-medium")).toBe(false);
  });

  it("adds a cheaper budget-friendly alternative when the recommendation is above budget", () => {
    const result = recommendPlan(
      {
        framework: "next",
        traffic: "high",
        budgetMonthlyToman: 1_000_000,
      },
      plans,
      bundles,
    );
    expect(result.recommended.totalMonthlyToman).toBeGreaterThan(1_000_000);
    expect(result.alternatives.some((option) => option.plan.id === "medium-g2")).toBe(true);
  });

  it("respects a hard need for more memory", () => {
    const result = recommendPlan(
      {
        framework: "docker",
        expectedVisitorsPerDay: 80_000,
        hasDatabase: true,
      },
      plans,
      bundles,
    );
    expect(result.recommended.plan.ram).toBeGreaterThanOrEqual(2);
  });
});
