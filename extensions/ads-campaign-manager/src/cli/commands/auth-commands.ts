import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
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

export function register_auth_commands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "cauhinhads",
    description: "Cấu hình Meta Ads Access Token và Ad Account ID.",
    handler: async (ctx: any) => {
      const args = (ctx.args || "").trim().split(/\s+/);
      if (args.length < 2) {
        return {
          text: "Dạ Sếp vui lòng cấu hình theo cú pháp:\n`/cauhinhads <access_token> <ad_account_id>`\n\nVí dụ: `/cauhinhads EAAG... act_123456789`"
        };
      }
      const [token, accountId] = args;
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);

      const { executeQuery } = await import("../../core/db.js");
      await executeQuery(pluginConfig,
        "UPDATE business_config SET meta_access_token = ?, meta_ad_account_id = ? WHERE id = ?",
        [token, accountId, businessId]
      );

      return { text: `✅ Tuyệt vời thưa Sếp! Em đã lưu cấu hình Ads cho **${pluginConfig.business.name}** thành công. Bây giờ em có thể bắt đầu đọc dữ liệu thật từ Meta rồi ạ!` };
    },
  });

  // ─── /nhap_token (UPGRADED v3) ─────────────────────────────────────────────
  // Multi-method page discovery + structured error logging
  

  api.registerCommand({
    name: "nhap_token",
    description: "Nhập Facebook User Token để kích hoạt hệ thống.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const token = (ctx.args || "").trim();

      if (!token) {
        return {
          text: [
            "📋 **CÁCH LẤY TOKEN FACEBOOK:**",
            "",
            "**Bước 1:** Mở link sau trên trình duyệt đã đăng nhập Facebook:",
            "https://developers.facebook.com/tools/explorer/",
            "",
            "**Bước 2:** Chọn App → nhấn **Generate Access Token**",
            "Cấp các quyền: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`,",
            "`pages_messaging`, `ads_management`, `ads_read`",
            "",
            "**Bước 3:** Copy token → gửi lệnh:",
            "`/nhap_token EAAxxxxxxxxxx`",
            "",
            "⚡ Bot sẽ tự động gia hạn token lên **60 ngày** và lưu vào hệ thống.",
            "",
            "💡 Phương án này không bao giờ bị Facebook Checkpoint.",
          ].join("\n"),
        };
      }

      if (!token.startsWith("EAA") && !token.startsWith("EAG")) {
        return { text: "❌ Token không hợp lệ. Token Facebook phải bắt đầu bằng `EAA...`" };
      }

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);

      try {
        const { initPhase3Tables, saveUserMetaAuth, saveUserFacebookPages } = await import("../../core/db-state.js");
        const { exchangeToLongLived, fetchUserPages, isMobileInternalToken, decodeFbHtmlToken, validateTokenBasic } = await import("../../auth/index.js");

        await initPhase3Tables(pluginConfig);

        // ── Phase 1: Validate token is actually alive ──
        const validation = await validateTokenBasic(token);
        if (!validation.valid) {
          return {
            text: `❌ **TOKEN KHÔNG HỢP LỆ!**\n\nEm đã kiểm tra token với Graph API và nhận lỗi:\n\`${validation.error}\` (code: ${validation.errorCode})`
          };
        }

        api.logger.info(`[nhap_token] Token validated! User: ${validation.userName} (${validation.userId})`);

        // ── Phase 3: Token exchange (short → long-lived) ──
        let finalToken = token;
        let expiresAt = Date.now() + 2 * 60 * 60 * 1000; // fallback 2h

        if (!isMobileInternalToken(token)) {
          try {
            const longLived = await exchangeToLongLived(pluginConfig, token, businessId);
            finalToken = longLived.token;
            expiresAt = longLived.expiresAt;
            api.logger.info(`[nhap_token] Token exchange SUCCESS | expiresAt=${new Date(expiresAt).toISOString()}`);
          } catch (extendErr: any) {
            api.logger.warn(`[nhap_token] Token exchange FAILED: ${extendErr.message}. Saving as short-lived.`);
          }
        } else {
          api.logger.info(`[nhap_token] Mobile token detected (EAAG/EAAB), skipping Graph API extension.`);
          expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;
        }

        const expiryDate = new Date(expiresAt).toLocaleDateString("vi-VN");
        const isExtended = expiresAt > Date.now() + 24 * 60 * 60 * 1000;

        // ── Save to DB ──
        await saveUserMetaAuth(pluginConfig, businessId, {
          email: "manual_token_input",
          passwordEnc: "N/A",
          accessToken: finalToken,
          expiresAt,
        });
        api.logger.info(`[nhap_token] Token saved to DB | businessId=${businessId}`);

        // ── Multi-method Page Discovery ──
        let pages: any[] = [];
        let discoveryMethod = "";
        const version = process.env.META_GRAPH_VERSION || "v19.0";

        // Method 1: Direct Graph API with Bearer auth (best for web-origin tokens)
        try {
          const directUrl = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,category,access_token&limit=100`;
          const directRes = await fetch(directUrl, {
            headers: { "Authorization": `Bearer ${finalToken}` }
          });
          const directJson = await directRes.json() as any;
          if (directJson?.data?.length > 0) {
            pages = directJson.data;
            discoveryMethod = "Graph API (Bearer auth)";
            api.logger.info(`[nhap_token] Page discovery Method 1 SUCCESS | count=${pages.length}`);
          } else if (directJson?.error) {
            api.logger.warn(`[nhap_token] Page discovery Method 1 FAILED | code=${directJson.error.code} | ${directJson.error.message}`);
          } else {
            api.logger.info(`[nhap_token] Page discovery Method 1: no pages returned (user may have no pages)`);
          }
        } catch (e: any) {
          api.logger.warn(`[nhap_token] Page discovery Method 1 error: ${e.message}`);
        }

        // Method 2: fetchUserPages with 4-layer mobile headers (fallback)
        if (pages.length === 0) {
          try {
            const mobilePages = await fetchUserPages(finalToken);
            if (mobilePages.length > 0) {
              pages = mobilePages;
              discoveryMethod = "Multi-layer discovery (mobile headers)";
              api.logger.info(`[nhap_token] Page discovery Method 2 SUCCESS | count=${pages.length}`);
            } else {
              api.logger.info(`[nhap_token] Page discovery Method 2: no pages returned`);
            }
          } catch (e: any) {
            api.logger.warn(`[nhap_token] Page discovery Method 2 FAILED: ${e.message}`);
          }
        }

        // Save pages to DB
        let pagesText = "Không tìm thấy Page nào.";
        if (pages.length > 0) {
          await saveUserFacebookPages(pluginConfig, businessId, "manual_token_input", pages);
          pagesText = `Tìm thấy **${pages.length} Page** (${discoveryMethod})`;
        }

        const tokenStatus = isExtended
          ? `✅ Token gia hạn thành công — hết hạn **${expiryDate}** (~60 ngày)`
          : `⚠️ Token ngắn hạn (~2h) — thêm META_APP_ID + META_APP_SECRET vào .env để gia hạn 60 ngày`;

        return {
          text: [
            "🚀 **TOKEN ĐÃ ĐƯỢC KÍCH HOẠT!**",
            "",
            `👤 Tài khoản: **${validation.userName}** (ID: ${validation.userId})`,
            tokenStatus,
            `📘 Pages: ${pagesText}`,
            "",
            "**Bước tiếp theo:**",
            pages.length > 0 ? "• `/page_list` → Xem và chọn Page để sử dụng" : "• `/capnhat_page` → Quét lại danh sách Page",
            "• `/kiem_tra` → Kiểm tra kết nối hệ thống",
            "• `/baocao` → Xem báo cáo Ads",
          ].join("\n"),
        };
      } catch (err: any) {
        const { parseGraphApiError, buildErrorMessage } = await import("../../facebook/graph-errors.js");
        const graphErr = parseGraphApiError(err);
        api.logger.error(`[nhap_token] FATAL: ${graphErr.message}`);
        return { text: buildErrorMessage("kích hoạt token", graphErr) };
      }
    },
  });

  // ─── Command Registry End ──────────────────────────────────────────────────
  

  /* 
  api.registerCommand({
    name: "nhap_cookie",
    ...
  });

  api.registerCommand({
    name: "dangnhapfb",
    ...
  });
  */

  // ─── /page_list ───────────────────────────────────────────────────────────
  

  api.registerCommand({
    name: "debug_auth",
    description: "Kiểm tra trạng thái kỹ thuật của hệ thống Auth & Pages.",
    handler: async () => {
      try {
        const { calculateBusinessId, getDbPool } = await import("../../core/db.js");
        const { getUserMetaAuth, getUserFacebookPages, initPhase3Tables } = await import("../../core/db-state.js");
        await initPhase3Tables(pluginConfig);

        const businessId = calculateBusinessId(pluginConfig.business.name);
        const dbPool = getDbPool(pluginConfig);
        const dbStatus = dbPool ? "🟢 Connected" : "🔴 Not connected (DB disabled or error)";

        const auth = await getUserMetaAuth(pluginConfig, businessId);
        const pages = await getUserFacebookPages(pluginConfig);

        const tokenPreview = auth?.access_token
          ? `${auth.access_token.substring(0, 10)}... (${auth.access_token.substring(0, 4)} type)`
          : "❌ No token stored";

        const expiresAt = auth?.token_expires_at
          ? new Date(Number(auth.token_expires_at)).toLocaleDateString("vi-VN")
          : "N/A";

        const lines = [
          "🔬 **DEBUG AUTH — Trạng thái Hệ thống**",
          "──────────────────────────────",
          `🏢 Business: \`${pluginConfig.business.name}\``,
          `🆔 Business ID: \`${businessId}\``,
          "",
          "🔑 **META AUTH:**",
          `• Email: ${auth?.fb_email || "❌ Not registered"}`,
          `• Token: \`${tokenPreview}\``,
          `• Hết hạn: ${expiresAt}`,
          `• Đăng nhập thành công: ${auth?.success_count ?? 0} lần`,
          `• Lỗi: ${auth?.fail_count ?? 0} lần`,
          auth?.last_error ? `• Lỗi cuối: ${String(auth.last_error).substring(0, 80)}` : "",
          "",
          "📘 **FACEBOOK PAGES:**",
          `• Tổng Pages trong DB: **${pages?.length ?? 0}**`,
          ...(pages ?? []).map((p: any) => `  • ${p.is_selected ? "📍" : "⚪"} ${p.page_name} (${p.id})`),
          "",
          "💾 **DATABASE:**",
          `• Trạng thái: ${dbStatus}`,
          "",
          "💡 Nếu No token stored → dùng `/nhap_token` để kích hoạt.",
          "💡 Nếu Pages = 0 → dùng `/nhap_token` cấp quyền đầy đủ và quét lại.",
        ].filter(l => l !== "");

        return { text: lines.join("\n") };
      } catch (err: any) {
        return { text: `❌ Debug error: ${err.message}` };
      }
    },
  });

  // ─── /capnhat_page ────────────────────────────────────────────────────────
  

}
