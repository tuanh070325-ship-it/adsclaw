import { requestGraphJson } from "./api-client.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Creates a new Meta Ad Campaign.
 * Safety Mode: Always created as PAUSED.
 */
export async function createMetaCampaign(
  config: AdsManagerPluginConfig,
  accessToken: string,
  adAccountId: string,
  params: {
    name: string;
    objective: "OUTCOME_TRAFFIC" | "OUTCOME_LEADS" | "OUTCOME_SALES" | "OUTCOME_AWARENESS";
    specialAdCategories?: string[];
  }
): Promise<string> {
  logger.info(`[CAMPAIGN] Creating campaign: ${params.name}`);

  const res = await requestGraphJson<{ id: string }>({
    config,
    accessToken,
    pathOrUrl: `/${adAccountId}/campaigns`,
    method: "POST",
    body: {
      name: params.name,
      objective: params.objective,
      status: "PAUSED", // Security default
      special_ad_categories: JSON.stringify(params.specialAdCategories ?? []),
      is_adset_budget_sharing_enabled: false,
    },
  });

  const campaignId = res.id;
  if (!campaignId) {
    throw new Error("Meta campaign creation successful but no ID returned.");
  }

  logger.info(`[CAMPAIGN] Success. Created Campaign ID: ${campaignId}`);
  return campaignId;
}
