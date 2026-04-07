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
import { getBusinessId, buildLenhUsage } from "./shared.js";
import {
  detectIntent,
  buildConfusedResponse,
  buildGreetingResponse,
  buildRoutingAck,
  isGreeting,
} from "../../telegram/chat-handler.js";


// ─── Refactored Page Command Handlers ──────────────────────────────────────────


export async function handleInbox(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig) {
  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, getPageInbox } = await import("../../facebook/index.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    const threads = await getPageInbox(pageCfg, 5);
    if (threads.length === 0) return { text: "📥 Inbox trống — chưa có tin nhắn nào." };
    
    const lines = ["📥 **INBOX — 5 tin nhắn mới nhất**", ""];
    for (const t of threads) {
      const unread = t.unread > 0 ? `🔴 ${t.unread} chưa đọc` : "✅ Đã đọc";
      lines.push(`👤 ${t.participants.join(", ")} | ${unread}`);
      lines.push(`   💬 ${t.snippet.slice(0, 80)}${t.snippet.length > 80 ? "..." : ""}`);
      lines.push(`   🆔 \`${t.id}\` | 🕐 ${t.updatedAt}`);
      lines.push("");
    }
    lines.push("💡 Trả lời: \`/tra_loi <conv_id> <nội dung>\`\n\n🚀 Để bật tự động chuyển tin nhắn mới về đây, dùng: \`/inbox_forward start\`");
    api.logger.info(`[inbox] Loaded ${threads.length} threads for page ${pageCfg.pageId}`);
    return { text: lines.join("\n") };
  } catch (err: any) {
    const { parseGraphApiError, formatErrorLog, buildErrorMessage } = await import("../../facebook/graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("inbox", "getPageInbox", graphErr));
    return { text: buildErrorMessage("đọc inbox", graphErr) };
  }
}

export async function handleTraLoi(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, argsStr: string) {
  const args = argsStr.trim().split(/\s+/);
  const threadId = args[0];
  const message = args.slice(1).join(" ");
  if (!threadId || !message) return { text: "Dùng: \`/tra_loi <conv_id> <nội dung trả lời>\`" };

  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, replyToMessage } = await import("../../facebook/index.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    await replyToMessage(pageCfg, threadId, message);
    api.logger.info(`[tra_loi] Reply sent to ${threadId}`);
    return { text: `✅ Đã gửi lời nhắn đến \`${threadId}\` thành công!` };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("../../facebook/graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("tra_loi", "replyToMessage", graphErr));
    return { text: buildErrorMessage("trả lời tin nhắn", graphErr) };
  }
}

export async function handleDatLich(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, argsStr: string) {
  const args = argsStr.trim().split(/\s+/);
  const datePart = args[0];
  const timePart = args[1];
  const message = args.slice(2).join(" ");

  if (!datePart || !timePart || !message) {
    return { text: "Dùng: \`/dat_lich 2026-04-01 09:00 Chào buổi sáng!\`" };
  }

  const scheduledTime = new Date(`${datePart}T${timePart}:00`).getTime() / 1000;
  if (isNaN(scheduledTime)) return { text: "❌ Định dạng ngày giờ không hợp lệ. Sếp dùng: YYYY-MM-DD HH:mm" };
  if (scheduledTime < (Date.now() / 1000) + 600) return { text: "❌ Thời gian lên lịch phải cách hiện tại ít nhất 10 phút." };

  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, schedulePost } = await import("../../facebook/index.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    const res = await schedulePost(pageCfg, message, scheduledTime);
    api.logger.info(`[dat_lich] SUCCESS | pageId=${pageCfg.pageId} postScheduleId=${res.id}`);
    return { text: `✅ Đã lên lịch thành công!\n🕐 Thời gian: ${datePart} ${timePart}\n📝 ID: \`${res.id}\`` };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("../../facebook/graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("dat_lich", "schedulePost", graphErr));
    return { text: buildErrorMessage("đặt lịch bài đăng", graphErr) };
  }
}

export async function handleXoaBai(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, postId: string) {
  if (!postId) return { text: "Dùng: \`/xoa_bai <post_id>\` (Dùng \`/bai_viet\` để lấy ID)" };

  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, deletePost } = await import("../../facebook/index.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    await deletePost(pageCfg, postId);
    api.logger.info(`[xoa_bai] SUCCESS | postId=${postId} pageId=${pageCfg.pageId}`);
    return { text: `✅ Đã xóa bài đăng \`${postId}\` thành công!` };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("../../facebook/graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("xoa_bai", "deletePost", graphErr));
    return { text: buildErrorMessage("xóa bài đăng", graphErr) };
  }
}

export async function handleBaiViet(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig) {
  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, getRecentPosts } = await import("../../facebook/index.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    const posts = await getRecentPosts(pageCfg, 10);
    if (!posts.data || posts.data.length === 0) return { text: "📝 Hiện chưa có bài viết nào trên Page." };
    
    const lines = ["📝 **10 BÀI ĐĂNG GẦN NHẤT**", ""];
    for (const p of posts.data) {
      const preview = p.message ? p.message.slice(0, 50) + (p.message.length > 50 ? "..." : "") : "(Ảnh/Video/Không lời)";
      lines.push(`📅 ${new Date(p.created_time).toLocaleString("vi-VN")}`);
      lines.push(`   💬 ${preview}`);
      lines.push(`   🆔 \`${p.id}\``);
      lines.push("");
    }
    api.logger.info(`[bai_viet] SUCCESS | pageId=${pageCfg.pageId}`);
    return { text: lines.join("\n") };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("../../facebook/graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("bai_viet", "getRecentPosts", graphErr));
    return { text: buildErrorMessage("lấy danh sách bài viết", graphErr) };
  }
}

export async function handleInboxForward(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, telegramId: string, action: string) {
  const { getOrInitForwarder } = await import("../../telegram/inbox-forwarder.js");
  const { resolvePageContext } = await import("../../facebook/index.js");
  const businessId = await getBusinessId(pluginConfig);

  const forwarder = getOrInitForwarder(
    { 
      pollIntervalMs: 15000, 
      telegramChatId: telegramId, 
      maxConvs: 20, 
      lookbackSec: 60 
    },
    () => resolvePageContext(pluginConfig, businessId),
    (text) => api.runtime.channel.telegram.sendMessageTelegram(telegramId, text).then(() => {})
  );

  const act = action.toLowerCase();
  if (act === "start") {
    return { text: await forwarder.start() };
  } else if (act === "stop") {
    return { text: forwarder.stop() };
  } else if (act === "status") {
    return { text: forwarder.getStatus() };
  } else {
    return { text: "Dùng: \`/inbox_forward start | stop | status\`" };
  }
}



export function register_post_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "inbox",
    description: "Xem 5 tin nhắn inbox mới nhất của Page.",
    handler: async () => handleInbox(api, pluginConfig),
  });

  // ─── /tra_loi ─────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "tra_loi",
    description: "Trả lời tin nhắn inbox (dùng: /tra_loi <conv_id> <nội dung>).",
    acceptsArgs: true,
    handler: async (ctx: any) => handleTraLoi(api, pluginConfig, ctx.args || ""),
  });

  // ─── /dat_lich ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "dat_lich",
    description: "Đặt lịch đăng bài (dùng: /dat_lich <YYYY-MM-DD HH:mm> <nội dung>).",
    acceptsArgs: true,
    handler: async (ctx: any) => handleDatLich(api, pluginConfig, ctx.args || ""),
  });

  // ─── /xoa_bai ─────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "xoa_bai",
    description: "Xóa bài đăng (dùng: /xoa_bai <post_id>).",
    acceptsArgs: true,
    handler: async (ctx: any) => handleXoaBai(api, pluginConfig, (ctx.args || "").trim()),
  });

  // ─── /bai_viet ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "bai_viet",
    description: "Xem 10 bài đăng gần nhất của Page.",
    handler: async () => handleBaiViet(api, pluginConfig),
  });

  // ─── /inbox_forward ───────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "inbox_forward",
    description: "Quản lý chuyển tiếp inbox (start/stop/status).",
    acceptsArgs: true,
    handler: async (ctx: any) => {
      const telegramId = String(ctx?.message?.from?.id || "");
      const action = (ctx.args || "").trim();
      return handleInboxForward(api, pluginConfig, telegramId, action);
    },
  });

  // ─── /dang_xuat ───────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "up_anh",
    description: "Đăng ảnh lên Page đang chọn (nhắn kèm URL ảnh và ghi chú).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const args = (ctx.args || "").trim().split(/\s+/);
      const imageUrl = args[0];
      const caption = args.slice(1).join(" ");

      if (!imageUrl) return { text: "Sếp ơi, cho em xin URL ảnh nhé! (Dùng: /up_anh <url> <ghi chú>)" };

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { resolvePageContext, uploadPhoto } = await import("../../facebook/index.js");
      const pageCfg = await resolvePageContext(pluginConfig, businessId);

      if (!pageCfg) {
        return { text: "❌ Sếp chưa chọn Page nào ạ! Sếp dùng lệnh /page_list để chọn Page trước nhé." };
      }

      try {
        const res = await uploadPhoto(pageCfg, imageUrl, caption);
        const postId = res.id?.split("_")[1] || res.id;
        const postUrl = `https://facebook.com/${pageCfg.pageId}/posts/${postId}`;
        api.logger.info(`[up_anh] SUCCESS | pageId=${pageCfg.pageId} photoId=${res.id}`);
        return { text: `✅ Đã đăng ảnh thành công!\n🔗 Xem ảnh: ${postUrl}\n📝 ID ảnh: \`${res.id}\`` };
      } catch (err: any) {
        const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("../../facebook/graph-errors.js");
        const graphErr = parseGraphApiError(err);
        api.logger.error(formatErrorLog("up_anh", "uploadPhoto", graphErr));
        return { text: buildErrorMessage("đăng ảnh", graphErr) };
      }
    },
  });

  // ─── /baocao ──────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "dang_bai",
    description: "Đăng bài viết lên Page đang chọn.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const message = (ctx.args || "").trim();
      if (!message) return { text: "Sếp ơi, nội dung bài đăng là gì ạ? (Dùng: /dang_bai <nội dung>)" };

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { resolvePageContext, createPost } = await import("../../facebook/index.js");
      const pageCfg = await resolvePageContext(pluginConfig, businessId);

      if (!pageCfg) {
        return { text: "❌ Sếp chưa chọn Page nào ạ! Sếp dùng lệnh /page_list để chọn Page trước nhé." };
      }

      try {
        const res = await createPost(pageCfg, message);
        const postId = res.id?.split("_")[1] || res.id;
        const postUrl = `https://facebook.com/${pageCfg.pageId}/posts/${postId}`;
        api.logger.info(`[dang_bai] SUCCESS | pageId=${pageCfg.pageId} postId=${res.id}`);
        return { text: `✅ Đã đăng thành công lên Page!\n🔗 Xem bài: ${postUrl}\n📝 ID: \`${res.id}\`` };
      } catch (err: any) {
        const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("../../facebook/graph-errors.js");
        const graphErr = parseGraphApiError(err);
        api.logger.error(formatErrorLog("dang_bai", "createPost", graphErr));
        return { text: buildErrorMessage("đăng bài", graphErr) };
      }
    },
  });

  // ─── /up_anh ──────────────────────────────────────────────────────────────
  

}
