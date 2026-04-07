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
import { suggestFollowUp, buildLenhUsage, findLatestQueuedInstructionId, getBusinessId } from "./shared.js";

export function register_bot_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  const withError = (handler: (ctx: any) => Promise<any>): ((ctx: any) => Promise<any>) => {
    return async (ctx) => {
      try {
        return await handler(ctx);
      } catch (err: any) {
        api.logger.error(`[ADS-BOT] Command ${ctx?.name || "unknown"} failed: ${err.message}`);
        if (process.env.NODE_ENV === "development") {
          console.error(err);
        }
        return { 
          text: `❌ **Lỗi Hệ Thống**\n\nCommand \`/${ctx?.name}\` gặp sự cố kỹ thuật.\nChi tiết: \`${err.message}\`\n\nSếp vui lòng thử lại sau hoặc kiểm tra cấu hình bằng \`/kiem_tra\`.` 
        };
      }
    };
  };

  api.registerCommand({
    name: "lenh",
    description: "Gửi lệnh mới cho trợ lý ads hoặc quản lý queue lệnh.",
    acceptsArgs: true,
    handler: withError(async (ctx) => {
      const text = ctx.args?.trim();
      if (!text) {
        return { text: buildLenhUsage() };
      }

      const tokens = text.split(/\s+/).filter(Boolean);
      const action = tokens[0]?.toLowerCase() ?? "";

      if (action === "status") {
        const context = await loadAssistantContext({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
        });
        return renderInstructionStatus(context);
      }

      if (action === "ack" || action === "done" || action === "xong") {
        const current = await loadAssistantContext({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
        });
        const requestedId = tokens[1]?.trim();
        const instructionId =
          !requestedId || requestedId === "latest"
            ? findLatestQueuedInstructionId(current)
            : requestedId;
        if (!instructionId) {
          return { text: "Không có lệnh nào đang ở trạng thái queued." };
        }
        const updated = await acknowledgeInstruction({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
          instructionId,
        });
        const instruction = updated.state.instructions.find((entry) => entry.id === instructionId);
        if (!instruction) {
          return { text: `Không tìm thấy instruction ${instructionId}.` };
        }
        return renderInstructionCompletion({
          context: updated,
          instruction,
        });
      }

      const { context, instruction } = await appendBossInstruction({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
        text,
      });
      const reply = renderInstructionAck({
        context,
        instruction,
      });
      return {
        ...reply,
        text: `${reply.text}\n${suggestFollowUp(text)}`,
      };
    }),
  });

  // ─── /start ───────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "start",
    description: "Khởi động Bot và mở Menu chính.",
    handler: withError(async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderWelcome(context);
    }),
  });

  // ─── /huong_dan ───────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "huongdan",
    description: "Xem hướng dẫn sử dụng bot.",
    handler: withError(async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderGuide(context);
    }),
  });

  // ─── /cau_hinh ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "cau_hinh",
    description: "Xem cấu hình token và môi trường.",
    handler: withError(async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderConfig(context);
    }),
  });

  // ─── /kiem_tra ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "kiem_tra",
    description: "Kiểm tra sức khỏe kết nối hệ thống.",
    handler: withError(async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderConfigCheck(context);
    }),
  });

  // ─── /noi_quy ─────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "noi_quy",
    description: "Xem nội quy sử dụng bot.",
    handler: withError(async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderRules(context);
    }),
  });

  // ─── /accounts (enterprise) ───────────────────────────────────────────────
  

  api.registerCommand({
    name: "accounts",
    description: "Xem chi tiết sức khỏe và hiệu suất của tất cả tài khoản Meta.",
    handler: withError(async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderEnterpriseHealth(context);
    }),
  });

  // NOTE: /ai command is registered in ai-commands.ts — do NOT duplicate here.

  // ─── /pixel_health ──────────────────────────────────────────────────────────
  
  api.registerCommand({
    name: "pixel_health",
    description: "Kiểm tra sức khỏe Pixel trực tiếp từ Meta API.",
    acceptsArgs: true,
    handler: withError(async (ctx) => {
      const { checkPixelHealth } = await import("../../facebook/pixel-health.js");
      const { getUserMetaAuth } = await import("../../core/db-state.js");
      
      const businessId = (await getBusinessId(pluginConfig)) || pluginConfig.business.name;
      const auth = await getUserMetaAuth(pluginConfig, businessId);
      const accessToken = auth?.access_token || pluginConfig.meta.accessToken;

      if (!accessToken) {
        return { text: "❌ Không tìm thấy Access Token cho Business này. Sếp vui lòng `openclaw login` hoặc cấu hình lại ạ!" };
      }

      const adAccountId = ctx.args?.trim() || pluginConfig.meta.adAccountId;
      if (!adAccountId) {
        return { text: "❌ Sếp chưa cấu hình Ad Account ID. Hãy dùng `/cau_hinh` hoặc truyền ID vào lệnh." };
      }

      const report = await checkPixelHealth(pluginConfig, accessToken, undefined, adAccountId);
      
      if (!report) {
         return { text: `⚠️ Không tìm thấy Pixel nào được gắn với tài khoản \`${adAccountId}\`.` };
      }

      const lines = [
        `🧬 **BÁO CÁO SỨC KHỎE PIXEL**`,
        `Tên: **${report.name}** (\`${report.id}\`)`,
        `Rating: **${report.grade}** (${report.score}/100)`,
        `--------------------------------`,
        `✅ Trạng thái: **${report.status === "active" ? "Hoạt động" : "Không hoạt động"}**`,
        `✅ CAPI Khấu trừ: **${report.capiDedup}%**`,
        `✅ Điểm EMQ: **${report.emq}/10.0**`,
      ];

      if (report.warnings.length > 0) {
        lines.push("", "⚠️ **CẢNH BÁO:**", ...report.warnings.map(w => `- ${w}`));
      }

      if (report.score >= 80) {
        lines.push("", "🟢 **ĐÁNH GIÁ:** Pixel rất khỏe, sẵn sàng cho Scale Up!");
      } else if (report.score >= 60) {
        lines.push("", "🟡 **ĐÁNH GIÁ:** Pixel tạm ổn, nên tối ưu thêm CAPI.");
      } else {
        lines.push("", "🔴 **ĐÁNH GIÁ:** Pixel đang gặp vấn đề, hệ thống sẽ chặn Scale Budget tự động.");
      }

      return { text: lines.join("\n") };
    }),
  });

  // ─── /price_apify ──────────────────────────────────────────────────────────

  api.registerCommand({
    name: "price_apify",
    description: "Kiểm tra số dư và hạn mức sử dụng Apify MCP.",
    handler: withError(async () => {
      const { loadAssistantContext } = await import("../../assistant/index.js");
      const { fulfillIntent: chatFulfill } = await import("../../telegram/chat-handler.js");
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return chatFulfill({
        intent: { action: "price_apify", confidence: "high", matchedPattern: "/price_apify" },
        context,
        api
      });
    }),
  });

  // ─── Sub-menu commands ────────────────────────────────────────────────────
  

}
