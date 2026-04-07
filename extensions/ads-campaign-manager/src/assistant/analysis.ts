import type { 
  AdsSnapshot, 
  AssistantState, 
  DerivedAssistantView, 
  AdsManagerPluginConfig,
  DerivedAlert,
  DerivedProposal,
  DerivedCampaignView,
  HealthLevel
} from "../core/types.js";

/**
 * Z-test for A/B testing statistical significance.
 */
export function calculateStatisticalSignificance(conversionsA: number, trafficA: number, conversionsB: number, trafficB: number) {
  if (trafficA === 0 || trafficB === 0) return { isSignificant: false, pValue: 1 };
  const pA = conversionsA / trafficA;
  const pB = conversionsB / trafficB;
  const pPool = (conversionsA + conversionsB) / (trafficA + trafficB);
  const se = Math.sqrt(pPool * (1 - pPool) * ((1 / trafficA) + (1 / trafficB)));
  if (se === 0) return { isSignificant: false, pValue: 1 };
  const zScore = Math.abs(pA - pB) / se;
  const pValue = Math.exp(-0.717 * zScore - 0.416 * zScore * zScore); // P-value approximation
  return { isSignificant: pValue < 0.05, pValue: Number(pValue.toFixed(4)), zScore };
}

/**
 * Diminishing returns budget scaling projection.
 */
export function projectBudgetScaling(currentSpend: number, currentCpa: number, multiplier: number) {
  if (multiplier <= 1) return { projectedCpa: currentCpa, isSafe: true };
  const increaseRatio = (multiplier - 1) / 0.5;
  const cpaDecay = 1 + (0.15 * increaseRatio);
  const projectedCpa = currentCpa * cpaDecay;
  return {
    projectedCpa: Number(projectedCpa.toFixed(0)),
    isSafe: cpaDecay < 1.3
  };
}

/**
 * Core engine to derive insights, alerts, and proposals from raw snapshots.
 */
export function buildDerivedAssistantView(params: {
  snapshot: AdsSnapshot | null;
  state: AssistantState;
  config: AdsManagerPluginConfig;
}): DerivedAssistantView {
  const generatedAt = new Date().toISOString();
  const alerts: DerivedAlert[] = [];
  const proposals: DerivedProposal[] = [];
  const winners: DerivedCampaignView[] = [];
  const atRisk: DerivedCampaignView[] = [];
  const watchlist: DerivedCampaignView[] = [];

  const snapshot = params.snapshot;
  if (!snapshot) {
    return {
      generatedAt,
      health: "watch",
      alerts: [{ id: "no_data", severity: "medium", title: "No Snapshot Data", summary: "Assistant has no recent ads data to analyze." }],
      generatedProposals: [],
      winners: [],
      atRisk: [],
      watchlist: [],
      dailyTasks: ["Connect Meta API or provide a valid snapshot.json"],
      budget: { spendToday: 0, budgetToday: 0, utilization: 0, overspending: false }
    };
  }

  // 1. Calculate Budget Summary
  const spendToday = snapshot.campaigns.reduce((sum, c) => sum + (c.spendToday || 0), 0);
  const budgetToday = snapshot.campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
  const utilization = budgetToday > 0 ? (spendToday / budgetToday) * 100 : 0;

  if (utilization > 110) {
    alerts.push({
      id: "budget_overspend",
      severity: "high",
      title: "Budget Overspending",
      summary: `Current spend is ${utilization.toFixed(0)}% of daily budget. Check pacing immediately.`
    });
  }

  // 2. Identify Winners and At-Risk Campaigns
  for (const campaign of snapshot.campaigns) {
    const isWinner = campaign.roas !== undefined && campaign.roas >= params.config.thresholds.scaleRoas;
    const isAtRisk = campaign.roas !== undefined && campaign.roas < params.config.thresholds.minRoas && (campaign.spendToday || 0) > params.config.thresholds.minSpendForDecision / 2;

    if (isWinner) {
      winners.push({ campaign, health: "good", reasons: ["ROAS is above scaling threshold"] });
      proposals.push({
        id: `scale_${campaign.id}`,
        status: "pending",
        impact: "high",
        title: `Scale winner: ${campaign.name}`,
        summary: `ROAS is ${campaign.roas?.toFixed(2)}x. Recommend increasing budget by ${params.config.execution.scaleUpMultiplier * 100}%.`,
        reason: "Performance qualifies for growth.",
        campaignId: campaign.id,
        createdAt: generatedAt,
        updatedAt: generatedAt
      });
    } else if (isAtRisk) {
      atRisk.push({ campaign, health: "risk", reasons: ["ROAS is below critical threshold"] });
      alerts.push({
        id: `low_roas_${campaign.id}`,
        severity: "high",
        title: "CRITICAL: Low ROAS",
        summary: `Campaign ${campaign.name} is performing poorly (${campaign.roas?.toFixed(2)}x).`
      });
    } else {
      watchlist.push({ campaign, health: "watch", reasons: ["Normal performance monitoring"] });
    }
  }

  return {
    generatedAt,
    health: alerts.some(a => a.severity === "high") ? "risk" : "good",
    alerts,
    generatedProposals: proposals,
    winners,
    atRisk,
    watchlist,
    dailyTasks: [
      "Review high-severity alerts",
      "Evaluate pending scaling proposals",
      "Check budget pacing"
    ],
    budget: {
      spendToday,
      budgetToday,
      utilization,
      overspending: utilization > 110
    }
  };
}
