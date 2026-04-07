import { uploadMetaImage } from "../facebook/media-service.js";
import { createMetaCampaign } from "../facebook/campaign-service.js";
import { createMetaAdSet } from "../facebook/adset-service.js";
import { createMetaAdCreative } from "../facebook/creative-service.js";
import { createMetaAd } from "../facebook/ad-service.js";
import { LandingPageValidator } from "./landing-page-validator.js";
import { AdRotationManager } from "./rotation-manager.js";
import { CopyGeneratorService } from "./copy-generator.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Unified pipeline for autonomous ad creation.
 * Chaining Phases 1 -> 2 -> 3 -> 4.
 */
export class AdOrchestrator {
  /**
   * Executes the full-funnel ad creation workflow.
   */
  static async runDeployment(
    config: AdsManagerPluginConfig,
    accessToken: string,
    adAccountId: string,
    pageId: string,
    params: {
      productName: string;
      productDescription: string;
      imagePath: string;
      linkUrl: string;
      budgetVnd: number;
    }
  ): Promise<string[]> {
    logger.info(`[ORCHESTRATOR] Starting deployment pipeline for: ${params.productName}`);

    // 1. Landing Page Pre-flight (Optimization #8)
    const lpResult = await LandingPageValidator.validatePage(params.linkUrl, [params.productName]);
    if (!lpResult.isValid) {
      throw new Error(`Deployment ABORTED: Landing page validation failed (${lpResult.reason}).`);
    }

    // 2. AI Copy Generation (Phase 4, Optimization #4)
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    const copyService = new CopyGeneratorService(anthropicKey);
    const variants = await copyService.generateVariants(config, {
      productDescription: params.productDescription,
    });

    // 3. Media Upload (Phase 1, Optimization #1/8)
    const imageHash = await uploadMetaImage(config, accessToken, adAccountId, params.imagePath);

    // 4. Campaign Creation (Phase 2, Safety First)
    const campaignId = await createMetaCampaign(config, accessToken, adAccountId, {
      name: `${params.productName}_AUTONOMOUS_V3`,
      objective: "OUTCOME_TRAFFIC",
    });

    const adIds: string[] = [];

    // 5. Variant Loop (Phase 3/5, A/B Testing)
    for (const [index, variant] of variants.entries()) {
      const schedule = AdRotationManager.getRotationSchedule(); // Optimization #1
      
      const adsetName = AdRotationManager.getRotationAdSetName(params.productName, `V${index+1}`);
      const adsetId = await createMetaAdSet(config, accessToken, adAccountId, {
        campaignId,
        name: adsetName,
        targetingPreset: "FASHION_ACTIVE", // Default for VN Fashion
        dailyBudgetVnd: params.budgetVnd / 7, // Optimization #6: Spread over 7 days
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      });

      const creativeId = await createMetaAdCreative(config, accessToken, adAccountId, {
        name: `${adsetName}_CREATIVE`,
        pageId,
        imageHash,
        headline: variant.headline,
        body: variant.body,
        linkUrl: params.linkUrl,
        callToAction: "SHOP_NOW",
      });

      const adId = await createMetaAd(config, accessToken, adAccountId, {
        adsetId,
        creativeId,
        name: `${adsetName}_AD`,
      });
      
      adIds.push(adId);
    }

    logger.info(`[ORCHESTRATOR] Deployment SUCCESS. Created ${adIds.length} ad variants.`);
    return adIds;
  }
}
