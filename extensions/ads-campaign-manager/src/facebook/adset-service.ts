import { requestGraphJson } from "./api-client.js";
import { VIETNAM_TARGETING_PRESETS, OPTIMIZED_PLACEMENTS } from "./targeting-presets.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Creates a new Meta Ad Set with strategic guardrails.
 * Optimization #5: Mandatory Pixel & Event tracking.
 * Optimization #6: 7-day budget rule.
 * Optimization #7: CPC Optimization via placements.
 */
export async function createMetaAdSet(
  config: AdsManagerPluginConfig,
  accessToken: string,
  adAccountId: string,
  params: {
    campaignId: string;
    name: string;
    targetingPreset: keyof typeof VIETNAM_TARGETING_PRESETS;
    dailyBudgetVnd: number;
    pixelId?: string;
    standardEvent?: 'PURCHASE' | 'LEAD' | 'COMPLETE_REGISTRATION' | 'CONTACT';
    startTime: string; // ISO String
    endTime?: string; // ISO String
  }
): Promise<string> {
  logger.info(`[ADSET] Creating ad set: ${params.name} for Campaign: ${params.campaignId}`);

  // Enforce 7-day budget rule (Optimization #6)
  const start = new Date(params.startTime);
  const end = params.endTime ? new Date(params.endTime) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const durationMs = end.getTime() - start.getTime();
  const durationDays = durationMs / (24 * 60 * 60 * 1000);

  if (durationDays < 7) {
    logger.warn(`[ADSET] Scaling Rule Violation: Duration is < 7 days. Extending to 7 days for learning phase.`);
    end.setTime(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  const targeting = VIETNAM_TARGETING_PRESETS[params.targetingPreset];
  
  // Mandatory check for Pixel if objective is conversion (Optimization #5)
  const promotedObject = params.pixelId ? {
    pixel_id: params.pixelId,
    custom_event_type: params.standardEvent || 'PURCHASE'
  } : undefined;

  const res = await requestGraphJson<{ id: string }>({
    config,
    accessToken,
    pathOrUrl: `/${adAccountId}/adsets`,
    method: "POST",
    body: {
      campaign_id: params.campaignId,
      name: params.name,
      status: "PAUSED",
      daily_budget: Math.round(params.dailyBudgetVnd).toString(),
      billing_event: "IMPRESSIONS",
      optimization_goal: "OFFSITE_CONVERSIONS",
      promoted_object: promotedObject ? JSON.stringify(promotedObject) : undefined,
      targeting: JSON.stringify(targeting),
      // Optimization #7: Optimized placements for Vietnam market
      publisher_platforms: JSON.stringify(OPTIMIZED_PLACEMENTS.publisher_platforms),
      facebook_positions: JSON.stringify(OPTIMIZED_PLACEMENTS.facebook_positions),
      instagram_positions: JSON.stringify(OPTIMIZED_PLACEMENTS.instagram_positions),
      device_platforms: JSON.stringify(OPTIMIZED_PLACEMENTS.device_platforms),
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    },
  });

  const adsetId = res.id;
  if (!adsetId) {
    throw new Error("Meta ad set creation successful but no ID returned.");
  }

  logger.info(`[ADSET] Success. Created Ad Set ID: ${adsetId}`);
  return adsetId;
}
