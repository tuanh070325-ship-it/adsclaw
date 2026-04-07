import { requestGraphJson } from "../facebook/api-client.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Manages automated budget scaling for winning ad sets.
 * Scaling Pitfall Guardrail: Max 30% increase per 24h.
 */
export class ScalingOrchestrator {
  /**
   * Scales an Ad Set's budget safely.
   */
  static async scaleAdSet(
    config: AdsManagerPluginConfig,
    accessToken: string,
    adsetId: string,
    currentBudget: number,
    targetIncreasePercent: number = 0.2 // Default 20%
  ): Promise<number> {
    // 1. Apply 30% Safety Cap
    const safeIncrease = Math.min(targetIncreasePercent, 0.3);
    const newBudget = Math.round(currentBudget * (1 + safeIncrease));

    logger.info(`[SCALING] Scaling Ad Set: ${adsetId}. Current: ${currentBudget} -> Target: ${newBudget} (+${(safeIncrease * 100).toFixed(0)}%)`);

    await requestGraphJson({
      config,
      accessToken,
      pathOrUrl: `/${adsetId}`,
      method: "POST",
      body: {
        daily_budget: newBudget.toString(),
      },
    });

    logger.info(`[SCALING] Success: Ad Set ${adsetId} scaled to ${newBudget}.`);
    return newBudget;
  }

  /**
   * Simple logic to identify scaling candidates (ROAS/CPA based).
   */
  static isScalingCandidate(params: {
    roas: number;
    targetRoas: number;
    cpa: number;
    targetCpa: number;
  }): boolean {
    return params.roas >= params.targetRoas && params.cpa <= params.targetCpa;
  }
}
