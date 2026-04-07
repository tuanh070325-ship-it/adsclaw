import { AdOrchestrator } from "../../services/ad-orchestrator.js";
import type { AdsManagerPluginConfig } from "../../core/types.js";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

/**
 * CLI Commands for the Autonomous Ads Manager.
 * Usage: openclaw ads-manager create --product="..." --budget=200000
 */
export function registerAdsManagerCliCommands(params: {
  api: OpenClawPluginApi;
  root: any; // commander.Command (ads-manager root)
  pluginConfig: AdsManagerPluginConfig;
}) {
  const { root, pluginConfig, api } = params;

  root
    .command("create")
    .description("Create a full autonomous ad campaign")
    .requiredOption("-p, --product <name>", "Product name")
    .requiredOption("-d, --description <text>", "Product description for AI copy-gen")
    .requiredOption("-i, --image <path>", "Path to local ad image")
    .requiredOption("-l, --link <url>", "Landing page / Website link")
    .option("-b, --budget <amount>", "Daily budget in VND", "200000")
    .action(async (options: any) => {
      api.logger.info(`[CLI] Triggering autonomous deployment for: ${options.product}`);
      
      try {
        const accessToken = process.env.FB_PAGE_ACCESS_TOKEN || ""; // Should resolve from config in production
        const adAccountId = pluginConfig.meta.adAccountId;
        const pageId = pluginConfig.meta.pageId;

        if (!accessToken || !adAccountId || !pageId) {
          throw new Error("Missing Meta configuration (token, accountId, or pageId). Run 'openclaw config' first.");
        }

        const adIds = await AdOrchestrator.runDeployment(pluginConfig, accessToken, adAccountId, pageId, {
          productName: options.product,
          productDescription: options.description,
          imagePath: options.image,
          linkUrl: options.link,
          budgetVnd: Number.parseInt(options.budget),
        });

        api.logger.info(`[CLI] SUCCESS! Created ${adIds.length} ad variants. IDs: ${adIds.join(", ")}`);
      } catch (err: any) {
        api.logger.error(`[CLI] FAILED: ${err.message}`);
        process.exit(1);
      }
    });

  root
    .command("status")
    .description("Check health and scaling opportunities")
    .action(async () => {
      api.logger.info("[CLI] Checking ad account health and scaling opportunities...");
      // Logic for Phase 5 health check will go here.
    });
}
