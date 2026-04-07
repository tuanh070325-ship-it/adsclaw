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
import { setSelectedPage, setSelectedAdAccount, setMetaAppConfig } from "../../core/db-state.js";
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
import {
  handleInbox,
  handleTraLoi,
  handleBaiViet,
  handleDatLich,
  handleXoaBai,
  handleInboxForward
} from "./post-commands.js";
import { suggestFollowUp, buildLenhUsage, findLatestQueuedInstructionId, getBusinessId } from "./shared.js";

export function register_ai_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "ai",
    description: "💬 Nói chuyện tự nhiên — hỏi bất cứ điều gì về ads của Sếp.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const message = (ctx.args ?? "").trim();

      if (!message) {
        return {
          text: [
            "Dạ Sếp ơi! Sếp muốn làm gì ạ? 🤖",
            "",
            "Sếp cứ nhắn tự nhiên nhé, em hiểu tiếng Việt ạ! Ví dụ:",
            "• \"báo cáo hôm nay\"",
            "• \"đối thủ nào đang chạy mạnh?\"",
            "• \"tăng budget camp A lên 20%\"",
            "• \"sức khỏe tài khoản thế nào?\"",
          ].join("\n"),
        };
      }

      if (isGreeting(message)) {
        return { text: buildGreetingResponse() };
      }

      const intent = detectIntent(message);
      const telegramId = String((ctx as any)?.message?.from?.id || "");
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });

      api.logger.info(`[ChatMode] "${message}" → intent=${intent.action} (${intent.confidence})`);

      switch (intent.action) {
        case "baocao":
          return renderReport(context);
        case "tongquan":
          return renderOverview(context);
        case "canhbao":
          return renderAlerts(context);
        case "ngansach":
          return renderBudget(context);
        case "de_xuat":
          return renderProposals(context);
        case "dongbo": {
          await runAssistantSync({ runtime: api.runtime, logger: api.logger, pluginConfig, telegramId });
          const syncCtx = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
          return renderSyncResult(syncCtx);
        }
        case "cau_hinh":
          return renderConfig(context);
        case "kiem_tra":
          return renderConfigCheck(context);
        case "huong_dan":
          return renderGuide(context);
        case "accounts": {
          try {
            const token = resolveMetaSecret(undefined, "META_ACCESS_TOKEN");
            if (!token) return { text: "Dạ Sếp, em chưa thấy Token Meta. Sếp cài đặt biến môi trường META_ACCESS_TOKEN trước nhé!" };
            
            api.logger.info("[ADS] Đang cào danh sách Tài Khoản Quảng Cáo từ Meta API...");
            const response = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${token}`);
            const json = await response.json();
            
            if (json.error) throw new Error(json.error.message);
            
            const adsAccs = json.data || [];
            if (adsAccs.length === 0) return { text: "Dạ Sếp, em không tìm thấy Tải khoản Quảng Cáo nào ăn theo Token này ạ." };
            
            const lines = ["💼 **DANH SÁCH TÀI KHOẢN QUẢNG CÁO META (BM / CÁ NHÂN)**\n"];
            adsAccs.forEach((a: any, idx: number) => {
              const status = a.account_status === 1 ? "🟢 Active (Đang hoạt động)" : a.account_status === 2 ? "🔴 Disabled (Vô hiệu hóa hoặc Bị cấm)" : `🟡 Khác (${a.account_status})`;
              lines.push(`**${idx + 1}. [${a.name || "Tài khoản ẩn danh"}]**`);
              lines.push(`   • ID Account: \`${a.id}\``);
              lines.push(`   • Trạng thái thẻ: ${status}\n`);
            });
            lines.push("👉 _*Lưu ý*: Sếp bấm Copy dòng `act_...` rồi dán vào cho em để ra lệnh Lên Camp nhé!_");
            
            return { text: lines.join("\n") };
          } catch (e: any) {
            return { text: `🔴 Lỗi khi quét tài khoản QC: ${e.message}` };
          }
        }
        case "chon_taikhoan": {
          const actId = intent.extractedArgs;
          if (!actId) return { text: "Dạ Sếp, Sếp muốn chọn tài khoản nào ạ? (Ví dụ: `chọn act_123456`)" };
          
          try {
            await setSelectedAdAccount(pluginConfig, actId);
            api.logger.info(`[Chon_TaiKhoan] Sếp đã chọn Ad Account: ${actId}`);
            
            return {
              text: `✅ Em đã nhớ! Từ giờ em sẽ lấy Tài khoản Quảng Cáo mặc định là: \`${actId}\` để Phân tích báo cáo & Lên Camp nhé Sếp! 🫡`
            };
          } catch (e: any) {
             return { text: `🔴 Lỗi khi chọn tài khoản: ${e.message}` };
          }
        }
        case "cai_dat_app": {
          const args = intent.extractedArgs; // Format "appId|appSecret"
          if (!args) {
            return { 
              text: "Dạ Sếp, em chưa nhận diện được App ID và App Secret. Sếp vui lòng gửi theo định dạng:\n`Nạp App ID: 1586990572517252 Secret: 27c5aa450de3b15cc6973df28cf7936c`" 
            };
          }
          const [appId, appSecret] = args.split("|");
          try {
            await setMetaAppConfig(pluginConfig, appId, appSecret);
            api.logger.info(`[CaiDatApp] Sếp đã nạp App ID: ${appId}`);
            return {
              text: "✅ **XÁC NHẬN NẠP THẺ BÀI THÀNH CÔNG!**\n\nEm đã lưu thông tin App ID và App Secret của Sếp vào bộ nhớ bảo mật. Từ nay hệ thống sẽ dùng chính mã này để gia hạn Token 60 ngày cho Sếp! 🚀"
            };
          } catch (e: any) {
            return { text: `🔴 Lỗi lưu cấu hình App: ${e.message}` };
          }
        }
        case "noi_quy":
          return renderRules(context);
        case "doithu_top": {
          const keyword = intent.extractedArgs ?? "Facebook Ads";
          return {
            text: [
              buildRoutingAck(intent),
              "",
              `Sếp muốn em phân tích ngành: "${keyword}" đúng không ạ?`,
              `Sếp dùng lệnh: /doithu_top ${keyword}`,
              "để em chạy phân tích đầy đủ nhé ạ!",
            ].join("\n"),
          };
        }
        case "pheduyet": {
          const pid = intent.extractedArgs;
          const pending = context.state.proposals.filter((p) => p.status === "pending");
          if (!pid && pending.length === 0) {
            return { text: "Dạ Sếp, hiện không có đề xuất nào đang chờ phê duyệt ạ." };
          }
          const targetId = pid ?? pending[0]!.id;
          try {
            const approvedCtx = await setProposalStatus({ runtime: api.runtime, logger: api.logger, pluginConfig, proposalId: targetId, status: "approved" });
            const approvedProposal = approvedCtx.state.proposals.find((p) => p.id === targetId);
            if (!approvedProposal) return { text: `Dạ Sếp, em không tìm thấy đề xuất "${targetId}" ạ.` };
            return renderApprovalResult({ context: approvedCtx, proposal: approvedProposal, action: "approved" });
          } catch (e: any) {
            return { text: e.message || String(e) };
          }
        }
        case "tuchoi": {
          const pid = intent.extractedArgs;
          if (!pid) return { text: "Dạ Sếp, Sếp muốn từ chối đề xuất nào ạ? Sếp cho em ID đề xuất nhé." };
          const rejectedCtx = await setProposalStatus({ runtime: api.runtime, logger: api.logger, pluginConfig, proposalId: pid, status: "rejected" });
          const rejectedProposal = rejectedCtx.state.proposals.find((p) => p.id === pid);
          if (!rejectedProposal) return { text: `Dạ Sếp, em không tìm thấy đề xuất "${pid}" ạ.` };
          return renderApprovalResult({ context: rejectedCtx, proposal: rejectedProposal, action: "rejected" });
        }
        case "lenh": {
          const result = await appendBossInstruction({ runtime: api.runtime, logger: api.logger, pluginConfig, text: message });
          return renderInstructionAck({ context: result.context, instruction: result.instruction });
        }
        case "inbox":
          return handleInbox(api, pluginConfig);
        case "tra_loi":
          return handleTraLoi(api, pluginConfig, intent.extractedArgs || message);
        case "bai_viet":
          return handleBaiViet(api, pluginConfig);
        case "dat_lich":
          return handleDatLich(api, pluginConfig, intent.extractedArgs || message);
        case "xoa_bai":
          return handleXoaBai(api, pluginConfig, intent.extractedArgs || "");
        case "inbox_forward":
          return handleInboxForward(api, pluginConfig, telegramId, intent.extractedArgs || "status");
        default:
          return { text: buildConfusedResponse(message) };
      }
    },
  });

  // ─── /themngucanhfile ─────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "themngucanhfile",
    description: "Gửi tài liệu để bot học (PDF/TXT/MD).",
    handler: async (ctx: any) => {
      const telegramId = String(ctx?.message?.from?.id || "");
      const fileUrl = (ctx.args || "").trim();
      if (!fileUrl) return { text: "Dạ Sếp vui lòng gửi file kèm lệnh này hoặc dán URL file nhé ạ!" };

      const { downloadFileToBuffer, detectFileType, extractTextFromFile, summarizeWithMistral } = await import("../../services/file-processor.js");
      const { saveUserDocument } = await import("../../services/knowledge-base.js");
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });

      try {
        const buffer = await downloadFileToBuffer(fileUrl);
        const filename = fileUrl.split("/").pop() || "document.pdf";
        const type = detectFileType(filename);
        const mistralToken = process.env.MISTRAL_API_KEY;

        const extracted = await extractTextFromFile(buffer, type, mistralToken);
        const summary = mistralToken ? await summarizeWithMistral(extracted, mistralToken) : undefined;

        const doc: any = {
          id: `kb_${Date.now().toString(36)}`,
          telegramId,
          filename,
          fileType: type,
          rawSizeBytes: buffer.length,
          extractedText: extracted,
          summary,
          processingStatus: "done",
          processingModel: mistralToken ? "mistral" : "local"
        };

        await saveUserDocument(pluginConfig, doc);
        const { renderKnowledgeAdded } = await import("../../ui/index.js");
        return renderKnowledgeAdded({ doc, context });
      } catch (err) {
        return { text: `⚠️ Lỗi đọc tài liệu: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ─── /xemngucanh ──────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "xemngucanh",
    description: "Xem bộ nhớ tài liệu của Sếp.",
    handler: async (ctx: any) => {
      const telegramId = String(ctx?.message?.from?.id || "");
      const { getUserDocuments } = await import("../../services/knowledge-base.js");
      const { renderKnowledgeList } = await import("../../ui/index.js");
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      const docs = await getUserDocuments(pluginConfig, telegramId);
      return renderKnowledgeList({ docs, context });
    },
  });

  }
