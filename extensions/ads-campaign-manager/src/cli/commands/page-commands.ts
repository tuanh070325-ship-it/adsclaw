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

export function register_page_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "page_list",
    description: "Xem danh sách Page có thể làm việc.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderPageSelectionMenu(context);
    },
  });

  // ─── /chon_page ───────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "chon_page",
    description: "Chọn Page để làm việc (nhắn kèm ID page).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const pageId = (ctx.args || "").trim();
      if (!pageId) return { text: "Sếp ơi, cho em xin ID của Page Sếp muốn chọn nhé ạ!" };

      const { getUserFacebookPages } = await import("../../core/db-state.js");
      const allPages = await getUserFacebookPages(pluginConfig);
      const targetPage = allPages?.find((p: any) => p.id === pageId);
      
      if (!targetPage) {
        return { text: `❌ Không tìm thấy Page ID \`${pageId}\`. Dùng /page_list để xem danh sách.` };
      }
      if (!targetPage.access_token) {
        api.logger.warn(`[chon_page] Page ${pageId} has no access_token — commands may fail`);
      }

      await setSelectedPage(pluginConfig, pageId);
      api.logger.info(`[chon_page] User selected pageId=${pageId}`);

      return { text: `✅ Đã chọn Page: **${targetPage.page_name || pageId}**\n\nBây giờ em sẽ dùng quyền của Page này để đăng bài và tương tác cho Sếp ạ!\n\n💡 Gợi ý:\n• \`/dang_bai <nội dung>\`: Đăng bài mới\n• \`/inbox\`: Xem tin nhắn mới nhất` };
    },
  });

  // ─── /accounts ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "capnhat_page",
    description: "Cập nhật danh sách Page từ tài khoản hiện tại.",
    handler: async (ctx: any) => handleCapNhatPage(api, pluginConfig, ctx),
  });

  async function handleCapNhatPage(api: any, pluginConfig: AdsManagerPluginConfig, ctx: any) {
    const context = await loadAssistantContext({
      runtime: api.runtime,
      logger: api.logger,
      pluginConfig,
    });
    
    // Robust token sourcing: context → DB direct → ENV
    let token = context.operations.accounts?.[0]?.access_token;
    if (!token) {
      const { getUserMetaAuth } = await import("../../core/db-state.js");
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const auth = await getUserMetaAuth(pluginConfig, businessId);
      token = auth?.access_token;
      if (token) api.logger.info(`[capnhat_page] Token sourced from user_meta_auth`);
    }
    if (!token) token = process.env.META_ACCESS_TOKEN;
    
    if (!token) {
      return { text: "❌ Sếp ơi, em chưa thấy tài khoản Facebook nào đăng nhập để quét Page ạ!\n\nDùng `/nhap_token` để nhập token nhé Sếp." };
    }

    const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
    const { fetchUserPages } = await import("../../auth/index.js");
    const { saveUserFacebookPages } = await import("../../core/db-state.js");

    // Multi-method Page Discovery
    let pages: any[] = [];
    let method = "";
    const version = process.env.META_GRAPH_VERSION || "v19.0";

    try {
      const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,category,access_token&limit=100`;
      const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
      const json = await res.json() as any;
      if (json?.data?.length > 0) {
        pages = json.data;
        method = "Graph API (Bearer auth)";
      }
    } catch (e: any) {
      api.logger.warn(`[capnhat_page] Method 1 (Bearer) FAILED: ${e.message}`);
    }

    if (pages.length === 0) {
      try {
        pages = await fetchUserPages(token, context.operations.accounts?.[0]?.proxy_url);
        if (pages.length > 0) method = "Multi-layer discovery (mobile headers)";
      } catch (e: any) {
        api.logger.warn(`[capnhat_page] Method 2 (fetchUserPages) FAILED: ${e.message}`);
      }
    }

    if (pages.length > 0) {
      await saveUserFacebookPages(pluginConfig, businessId, context.operations.accounts?.[0]?.fb_email || "auto_renew", pages);
      api.logger.info(`[capnhat_page] SUCCESS | count=${pages.length} method=${method}`);
      return { text: `✅ Đã quét xong! Tìm thấy **${pages.length} Page** (qua ${method}). Sếp dùng /page_list để xem và chọn nhé!` };
    } else {
      // Method 3: Fallback to safeAutoLoginOrRenew if cookies exist
      const { getUserMetaAuth } = await import("../../core/db-state.js");
      const auth = await getUserMetaAuth(pluginConfig, businessId);
      
      if (auth?.cookies) {
        api.logger.info(`[capnhat_page] Fallback to safeAutoLoginOrRenew via Cookies`);
        const senderId = (ctx as any).from || (ctx as any).senderId;
        const { safeAutoLoginOrRenew } = await import("../../auth/index.js");
        
        safeAutoLoginOrRenew(pluginConfig, {
          business_id: businessId,
          fb_email: auth.fb_email,
          fb_password_enc: auth.fb_password
        }, (msg) => {
          if (senderId) api.runtime.channel.telegram.sendMessageTelegram(senderId, msg).catch(() => {});
        }).catch(e => api.logger.error(`[capnhat_page] Background sync FAILED: ${e.message}`));

        return { text: "⚠️ Không tìm thấy Page qua API. Em đang dùng Trình duyệt ảo để quét sâu hơn cho Sếp, Sếp đợi em chút nhé..." };
      }

      const isEAAG = token.startsWith("EAAG");
      const hint = isEAAG 
        ? "\n\n💡 **Mẹo:** Token của Sếp là loại `EAAG` (Android), loại này Meta thường chặn quét qua API (Lỗi Code 1). Sếp nên kiểm tra lại quyền truy cập của Token trên Graph API Explorer để đảm bảo Token có quyền `pages_read_engagement` ạ!"
        : "\n\n💡 **Gợi ý:** Nếu Sếp chắc chắn mình có Page, hãy thử kiểm tra lại quyền của Token trên trình quản lý ứng dụng Meta nhé.";

      return { text: `⚠️ Không tìm thấy Page nào. Token có thể thiếu quyền hoặc tài khoản chưa tạo Page.${hint}` };
    }
  }

  // ─── /dang_bai ────────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "reset_page",
    description: "Xóa danh sách Page và quét lại từ đầu.",
    handler: async (ctx: any) => {
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { clearUserFacebookPages } = await import("../../core/db-state.js");

      // Clear existing
      await clearUserFacebookPages(pluginConfig, businessId);
      
      // Trigger update via the extracted handler
      return handleCapNhatPage(api, pluginConfig, ctx);
    },
  });

  api.registerCommand({
    name: "dang_xuat",
    description: "Đăng xuất tài khoản Facebook và xóa toàn bộ dữ liệu Page.",
    handler: async () => {
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { executeQuery } = await import("../../core/db.js");
      const { clearUserFacebookPages } = await import("../../core/db-state.js");

      // 1. Clear Pages
      await clearUserFacebookPages(pluginConfig, businessId);
      
      // 2. Clear Auth
      await executeQuery(pluginConfig, "DELETE FROM user_meta_auth WHERE business_id = ?", [businessId]);
      
      // 3. Clear Business Config Token
      await executeQuery(pluginConfig, "UPDATE business_config SET meta_access_token = NULL WHERE id = ?", [businessId]);

      api.logger.info(`[dang_xuat] SUCCESS | businessId=${businessId}`);
      return { text: "✅ **ĐÃ ĐĂNG XUẤT THÀNH CÔNG!**\n\nToàn bộ dữ liệu Token và Page đã được xóa sạch khỏi hệ thống. Sếp có thể bắt đầu lại bằng `/nhap_token` nhé!" };
    },
  });

}
