import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  acknowledgeInstruction,
  appendBossInstruction,
  loadAssistantContext,
  runAssistantSync,
  setProposalStatus,
} from "../../assistant/index.js";
import type { AdsManagerPluginConfig } from "../../core/types.js";
import {
  renderAlerts,
  renderApprovalResult,
  renderBudget,
  renderCompetitors,
  renderInstructionAck,
  renderInstructionCompletion,
  renderInstructionStatus,
  renderOverview,
  renderPlan,
  renderProposals,
  renderReport,
  renderSyncResult,
  renderGuide,
  renderConfig,
  renderConfigCheck,
  renderRules,
  renderWelcome,
  renderSubMenuKiemSoan,
  renderSubMenuChienThuat,
  renderSubMenuRaLenh,
  renderSubMenuPage,
  renderKhamPha,
  renderTopCompetitorAds,
  renderEnterpriseHealth,
  renderPageSelectionMenu,
} from "../../ui/index.js";
import { setSelectedPage } from "../../core/db-state.js";
import { getPostEngagement } from "../../services/apify-service.js";
import { calculateAdTrustScore, estimateEngagementFromProxy } from "../../core/ad-math.js";
import { resolveMetaSecret } from "../../facebook/index.js";
import {
  detectIntent,
  buildConfusedResponse,
  buildGreetingResponse,
  buildRoutingAck,
  isGreeting,
} from "../../telegram/chat-handler.js";
import { suggestFollowUp, buildLenhUsage, findLatestQueuedInstructionId, getBusinessId } from "./shared.js";

export function register_menu_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "menu_kiemsoan",
    description: "Menu kiểm soát hiệu suất Ads.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuKiemSoan(context);
    },
  });

  

  api.registerCommand({
    name: "menu_chienthuat",
    description: "Menu chiến thuật & nghiên cứu đối thủ.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuChienThuat(context);
    },
  });

  

  api.registerCommand({
    name: "menu_ralenh",
    description: "Menu ra lệnh và phê duyệt AI.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuRaLenh(context);
    },
  });

  

  api.registerCommand({
    name: "menu_page",
    description: "Menu quản lý Facebook Fanpage.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuPage(context);
    },
  });

  

  api.registerCommand({
    name: "kham_pha",
    description: "Khám phá tính năng nâng cao.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderKhamPha(context);
    },
  });


  

}
