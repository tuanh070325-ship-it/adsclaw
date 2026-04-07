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
import { routeToActor } from "../../core/actor-router.js";
import {
  detectIntent,
  buildConfusedResponse,
  buildGreetingResponse,
  buildRoutingAck,
  isGreeting,
} from "../../telegram/chat-handler.js";
import {
  suggestFollowUp,
  buildLenhUsage,
  findLatestQueuedInstructionId,
  getBusinessId,
  checkAndResetCircuit,
  recordApifyError,
  apifyCircuit
} from "./shared.js";

export function register_report_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "baocao",
    description: "Xem báo cáo ads hiện tại.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderReport(context);
    },
  });

  // ─── /tongquan ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "tongquan",
    description: "Xem tổng quan sức khỏe account ads.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderOverview(context);
    },
  });

  // ─── /canhbao ─────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "canhbao",
    description: "Liệt kê cảnh báo hiện tại.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderAlerts(context);
    },
  });

  // ─── /ngansach ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "ngansach",
    description: "Xem điều phối ngân sách và pacing.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderBudget(context);
    },
  });

  // ─── /kehoach ─────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "kehoach",
    description: "Xem kế hoạch hành động hôm nay.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderPlan(context);
    },
  });

  // ─── /de_xuat ─────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "de_xuat",
    description: "Xem danh sách đề xuất chờ duyệt.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderProposals(context);
    },
  });

  // ─── /doithu ──────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "doithu",
    description: "Xem ghi chú đối thủ (hoặc dán Link để thám báo mới).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const arg = ctx.args?.trim();
      if (arg) {
        const { appendBossInstruction } = await import("../../assistant/index.js");
        await appendBossInstruction({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
          text: `thám báo đối thủ: ${arg}`,
        });
        return { text: `🚀 **Lệnh Thám Báo Đã Nhận**\n\nEm đang bắt đầu phân tích: \`${arg}\`.\n\n⚡️ **Tối ưu hóa**: Đã kích hoạt chế độ "Săn đuổi song song" — kết quả sẽ có trong khoảng 30-60 giây.` };
      }
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderCompetitors(context);
    },
  });

  // ─── /dongbo ──────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "dongbo",
    description: "Đồng bộ dữ liệu cục bộ cho trợ lý ads.",
    handler: async () => {
      const context = await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderSyncResult(context);
    },
  });

  // ─── /pheduyet ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "pheduyet",
    description: "Duyệt một đề xuất theo ID.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const proposalId = ctx.args?.trim();
      if (!proposalId) {
        return { text: "Dùng: /pheduyet <proposal_id>" };
      }
      const context = await setProposalStatus({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
        proposalId,
        status: "approved",
      });
      const proposal = context.state.proposals.find((entry) => entry.id === proposalId);
      if (!proposal) {
        return { text: `Không tìm thấy đề xuất ${proposalId}.` };
      }
      return renderApprovalResult({
        context,
        proposal,
        action: "approved",
      });
    },
  });

  // ─── /tuchoi ──────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "tuchoi",
    description: "Từ chối một đề xuất theo ID.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const proposalId = ctx.args?.trim();
      if (!proposalId) {
        return { text: "Dùng: /tuchoi <proposal_id>" };
      }
      const context = await setProposalStatus({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
        proposalId,
        status: "rejected",
      });
      const proposal = context.state.proposals.find((entry) => entry.id === proposalId);
      if (!proposal) {
        return { text: `Không tìm thấy đề xuất ${proposalId}.` };
      }
      return renderApprovalResult({
        context,
        proposal,
        action: "rejected",
      });
    },
  });

  // ─── /lenh ────────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "doithu_top",
    description: "Top bài quảng cáo đối thủ hiệu quả nhất, đã được chấm điểm AI.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const keyword = (ctx.args ?? "").trim();
      if (!keyword || keyword.length > 100) {
        return { text: "❌ Vui lòng nhập từ khóa. Ví dụ: /doithu_top Đồ Gỗ" };
      }

      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });

      const apifyConfig = pluginConfig.intelligence?.apify;
      const apifyToken = apifyConfig?.enabled
        ? resolveMetaSecret(apifyConfig.apiToken, apifyConfig.apiTokenEnvVar)
        : null;

      const rawResults = await routeToActor({
        goal: "SCAN",
        query: keyword,
        country: "VN",
        limit: 10,
        config: pluginConfig,
        api
      });
      const adsList = Array.isArray(rawResults) ? rawResults : [];

      const liveAds = adsList.map(ad => {
        const daysLive = ad._runDays || (ad.startDate ? Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86400000) : 0);
        return {
          adLibraryId: ad.id || "",
          adText: ad.adText || "",
          pageName: ad.pageName || keyword,
          postUrl: undefined,
          adLibraryUrl: ad.libraryUrl || `https://facebook.com/ads/library/?id=${ad.id}`,
          startDate: ad.startDate || new Date().toISOString(),
          daysLive: daysLive,
          isActive: ad.status === "active",
          platforms: ad.platforms || ["facebook", "instagram"],
          mediaType: ad.videoUrl ? "video" : (ad.imageUrl ? "image" : "other") as "image" | "video" | "carousel" | "other",
          impressionsBand: "5K-20K" as const,
          ctaButton: "",
        };
      });

      const validAds = liveAds.filter((a) => a.daysLive >= 7);
      const scoredAds = [];
      checkAndResetCircuit(api.logger);

      for (const ad of validAds) {
        let engagement;

        if (ad.postUrl && apifyToken && !apifyCircuit.broken) {
          try {
            engagement = await getPostEngagement({
              config: pluginConfig,
              postUrl: ad.postUrl
            });
            apifyCircuit.errorCount = 0;
          } catch (err: any) {
            api.logger.warn(`[Phase19] Apify engagement failed for ${ad.adLibraryId}: ${err.message}`);
            recordApifyError(api.logger);
            engagement = estimateEngagementFromProxy(ad);
          }
        } else {
          engagement = estimateEngagementFromProxy(ad);
        }

        const scored = calculateAdTrustScore({ ad, engagement });
        scoredAds.push(scored);
        await new Promise((r) => setTimeout(r, 2000));
      }

      const qualified = scoredAds
        .filter((a) => a.trustScore >= 60)
        .sort((a, b) => b.trustScore - a.trustScore || b.daysLive - a.daysLive);

      return renderTopCompetitorAds({
        keyword,
        totalScanned: validAds.length,
        qualifiedCount: qualified.length,
        topAds: qualified.slice(0, 5),
        context,
      });
    },
  });

  // ─── /ai ──────────────────────────────────────────────────────────────────
  

}
