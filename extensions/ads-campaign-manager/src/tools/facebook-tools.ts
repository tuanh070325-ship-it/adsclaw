import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { AdsManagerPluginConfig } from "../core/types.js";
import { performIndustryDiscovery, fmtVND, checkSystemHealth, stringEnum } from "./helpers.js";
import { loadAssistantContext } from "../assistant/index.js";
import { syncBusinessData } from "../assistant/business-sync.js";

export function createToolGroup(params: { api: OpenClawPluginApi; pluginConfig: AdsManagerPluginConfig; }): AnyAgentTool[] {
  const { api, pluginConfig } = params;
  const runtime = api.runtime;
  const logger = api.logger;

  // ─ Tool 15: market_industry_discovery ──────────────────────────────────────
  const marketIndustryDiscoveryTool: AnyAgentTool = {
    name: "market_industry_discovery",
    label: "Explore Winning Ads by Industry",
    description: "Search for high-performing ads (Winning Ads) across the whole market for a specific niche/industry keyword. Use this for general trends and broad competitor intelligence.",
    parameters: Type.Object({
      keyword: Type.String({ description: "Industry or product keyword (e.g. 'đồ áo trẻ em', 'thẩm mỹ viện')" }),
      country: Type.Optional(Type.String({ description: "2-letter country code (default: VN)" })),
      platform: Type.Optional(stringEnum(["FB", "IG", "GOOGLE"], "Target platform (default: FB)")),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default: 10)" }))
    }),
    execute: async (_id, raw: any) => {
      const summary = await performIndustryDiscovery({ ...raw, config: pluginConfig });
      return { content: [{ type: "text" as const, text: summary }], details: { keyword: raw.keyword } };
    },
  };

  // ─ Tool 16: sync_business_data ─────────────────────────────────────────────
  const syncBusinessDataTool: AnyAgentTool = {
    name: "sync_business_data",
    label: "Sync Business / Sales Data",
    description: "Fetch real sales, leads, and revenue data from CRM/POS to compare against Meta Ads performance.",
    parameters: Type.Object({
      dateRange: Type.Optional(Type.String({ description: "Date range, e.g. 'today', 'last_7d'" })),
      sourceType: Type.Optional(Type.String({ description: "'crm' | 'sheets' | 'pos' (default: crm)" }))
    }),
    execute: async (_id, raw: any) => {
      const src = (raw.sourceType === "sheets" || raw.sourceType === "pos") ? raw.sourceType : "crm";
      const result = await syncBusinessData({ dateRange: raw.dateRange, sourceType: src as any });
      
      const summary = [
        `📊 BUSINESS DATA SYNC — Source: ${result.source} | Date: ${result.dateRange}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `👥 Total Leads: ${result.totalLeads} | Qualified Leads: ${result.qualifiedLeads} (${Math.round((result.qualifiedLeads / Math.max(result.totalLeads, 1)) * 100)}%)`,
        `💰 Total Sales: ${result.totalSales} | Revenue: ${fmtVND(result.revenue)}`,
        `⭐ Top Products: ${result.topPerformingProducts?.join(", ") ?? "N/A"}`,
        ``,
        `📝 Note: ${result.feedbackNotes ?? "No notes"}`,
        ``,
        `→ Use this data to analyze ads true ROAS and adjust A/B testing strategy.`
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: result };
    }
  };

  // ─ Tool 17: ads_manager_doctor ─────────────────────────────────────────────
  const doctorTool: AnyAgentTool = {
    name: "ads_manager_doctor",
    label: "System Health & Diagnostic",
    description: "Check system connection, API tokens, and sync status. Use this if the bot seems slow or data is missing.",
    parameters: Type.Object({}),
    execute: async () => {
      const health = await checkSystemHealth(pluginConfig);
      const ctx = await loadAssistantContext({ runtime, logger, pluginConfig });
      
      const summary = [
        `🩺 ADS MANAGER SYSTEM DOCTOR`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        health,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🕒 Last Sync: ${ctx.state.lastSyncAt ?? "Never"}`,
        `📦 Data Source: ${ctx.operations.dataSource.toUpperCase()}`,
        `⚠️ Warnings: ${ctx.warnings.length}`,
        ...ctx.warnings.map(w => `  - ${w}`),
        ``,
        `→ Everything looks stable. If a token is expired, update your .env file.`
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: { health, warnings: ctx.warnings } };
    }
  };

  // ─ Tool 18: ads_manager_get_competitor_insights ──────────────────────────
  const getCompetitorInsightsTool: AnyAgentTool = {
    name: "ads_manager_get_competitor_insights",
    label: "Query Competitor Database",
    description: "Search internal MySQL database for previously saved competitor ads and insights. Use this to get 'accurate' historical data if the live scraper is blocked or limited.",
    parameters: Type.Object({
      pageName: Type.Optional(Type.String({ description: "Filter by competitor name (partial match)" })),
    }),
    execute: async (_id, raw: any) => {
      const { getCompetitorAdsFromDb } = await import("../core/db-state.js");
      const ads = await getCompetitorAdsFromDb(pluginConfig, { pageName: raw.pageName });
      
      if (ads.length === 0) {
        return { content: [{ type: "text" as const, text: `ℹ️ Không tìm thấy dữ liệu cũ về "${raw.pageName || "đối thủ"}" trong Database.` }], details: { ads: [] } };
      }

      const summary = [
        `🗄️ DATABASE INSIGHTS: Found ${ads.length} historical records for "${raw.pageName || "Competitors"}"`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ads.map((ad: any, i: number) => {
          const date = ad.started_at ? (ad.started_at instanceof Date ? ad.started_at.toISOString().split('T')[0] : ad.started_at) : "N/A";
          return `${i+1}. [${ad.page_name}] Started: ${date} | Lived: ${ad.duration_days}d | CTA: ${ad.cta_type || "N/A"}\n   Hook: ${ad.hook_text?.slice(0, 100)}...`;
        }).join("\n\n"),
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `→ Use this data to compare with live results or calculate ROI benchmarks.`
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: { ads, count: ads.length } };
    }
  };

  // ─ Tool 19: manage_facebook_page ─────────────────────────────────────────
  const manageFacebookPageTool: AnyAgentTool = {
    name: "manage_facebook_page",
    label: "Facebook Page Manager & CRM",
    description: "Manage Fanpage content, insights, comments, events, and scheduling via Graph API. Actions: schedulePost, deletePost, uploadVideo, getRecentPosts, getPageInfo, likePost, replyToPostComment, hideComment, deletePostComment, getPageInsights, getPostInsights, listEvents, createEvent, listAlbums, getPageRoles, publishDraftPost. Pass parameters in 'payload' as JSON.",
    parameters: Type.Object({
      action: Type.String({ description: "The API action name" }),
      payload: Type.Optional(Type.String({ description: "JSON string of parameters like { message, unixTimeSpanSeconds, postId, etc }" })),
    }),
    execute: async (_id, raw: any) => {
      const fbApi = await import("../facebook/index.js");
      const bsId = (pluginConfig as any).business?.id || (pluginConfig as any).businessId || "QWRzIENhbXBhaWduIE1hbmFnZXI=";
      let cfg: any = { pageId: (pluginConfig as any).pageId || process.env.FB_PAGE_ID, businessId: bsId };
      
      const resolved = await fbApi.resolvePageContext(pluginConfig, bsId);
      if (resolved) cfg = resolved;

      let p: any = {};
      if (raw.payload) {
        try { p = JSON.parse(raw.payload); } catch { /* ignore */ }
      }

      try {
        let result: any;
        switch (raw.action) {
          case "schedulePost": result = await fbApi.schedulePost(cfg, p.message, p.unixTimeSpanSeconds, p.link); break;
          case "uploadVideo": result = await fbApi.uploadVideo(cfg, p.videoUrl, p.description); break;
          case "deletePost": result = await fbApi.deletePost(cfg, p.postId); break;
          case "getRecentPosts": result = await fbApi.getRecentPosts(cfg, p.limit); break;
          case "getPageInfo": result = await fbApi.getPageInfo(cfg); break;
          case "likePost": result = await fbApi.likePost(cfg, p.postId); break;
          case "replyToPostComment": result = await fbApi.replyToPostComment(cfg, p.commentId, p.message); break;
          case "hideComment": result = await fbApi.hideComment(cfg, p.commentId); break;
          case "deletePostComment": result = await fbApi.deletePostComment(cfg, p.commentId); break;
          case "getPageInsights": result = await fbApi.getPageInsights(cfg); break;
          case "getPostInsights": result = await fbApi.getPostInsightsNode(cfg, p.postId); break;
          case "listEvents": result = await fbApi.listEvents(cfg); break;
          case "createEvent": result = await fbApi.createEvent(cfg, p.name, p.startTime, p.description); break;
          case "listAlbums": result = await fbApi.listAlbums(cfg); break;
          case "getPageRoles": result = await fbApi.getPageRoles(cfg); break;
          case "publishDraftPost": result = await fbApi.publishDraftPost(cfg, p.postId); break;
          default: return { content: [{ type: "text" as const, text: `❌ Unknown action: ${raw.action}` }], details: { error: "invalid_action" } };
        }
        const bt = JSON.stringify(result, null, 2).slice(0, 4000);
        return { content: [{ type: "text" as const, text: `✅ [${raw.action}] Success:\n${bt}` }], details: result };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `❌ [${raw.action}] Error: ${e.message}` }], details: { error: e.message } };
      }
    }
  };

  // ─ Tool 20: post_to_personal_profile ─────────────────────────────────────
  const postToPersonalProfileTool: AnyAgentTool = {
    name: "post_to_personal_profile",
    label: "Post to Personal Facebook Profile (Browser Automation)",
    description: "Post a status update or photo directly to the user's PERSONAL Facebook Profile using browser automation (Playwright bypasses API restrictions). Use this only when the user explicitly asks to post to their personal profile (Trang cá nhân). Do not use this for Fanpages.",
    parameters: Type.Object({
      message: Type.String({ description: "The content of the post" }),
      photoPath: Type.Optional(Type.String({ description: "Absolute path to a photo file to upload, if any" }))
    }),
    execute: async (_id, raw: any) => {
      try {
        const profileOps = await import("../facebook/meta-profile-ops.js");
        const bsId = (pluginConfig as any).business?.id || (pluginConfig as any).businessId || "QWRzIENhbXBhaWduIE1hbmFnZXI=";
        
        // Execute browser automation
        const result = await profileOps.createProfilePost(pluginConfig, bsId, raw.message, raw.photoPath);
        
        if (result.success) {
          return { 
            content: [{ type: "text" as const, text: `✅ Đăng bài lên Profile Cá Nhân thành công! Nền tảng tự động hóa Browser (Playwright) đã thực thi an toàn.` }], 
            details: result 
          };
        } else {
          return { 
            content: [{ type: "text" as const, text: `❌ Đăng bài lên Profile Cá Nhân thất bại: ${result.error}` }], 
            details: result 
          };
        }
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `❌ Lỗi hệ thống khi gọi trình duyệt ảo: ${e.message}` }], details: { error: e.message } };
      }
    }
  };

  return [
    marketIndustryDiscoveryTool,
    syncBusinessDataTool,
    doctorTool,
    getCompetitorInsightsTool,
    manageFacebookPageTool,
    postToPersonalProfileTool
  ];
}
