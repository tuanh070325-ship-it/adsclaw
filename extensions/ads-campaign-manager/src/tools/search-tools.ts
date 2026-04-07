
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { AdsManagerPluginConfig } from "../core/types.js";


import {
  loadAssistantContext, setProposalStatus,
  acknowledgeInstruction, createProposal, appendCompetitorInsight,
} from "../assistant/index.js";
import { performWebSearch } from "../services/web-search.js";
import { scrapePage } from "../services/scraper.js";
import { analyzeCompetitorAdsWithApify } from "../services/apify-service.js";
import {
  httpFetch, serperSearch,
  apifyFacebookAdsScraper,
  scrapeCreatorsIndustrySearch, googleAdsSearch,
  buildAdLibraryUrl, fetchMetaAccountData, calcHealthScore,
  safeStr, type AdLibraryResult, type MetaCampaignData,
  metaDeepIntel, tiktokScraper, googleOcrScraper
} from "../http/index.js";
import { routeToActor } from "../core/actor-router.js";
import { fetchTikTokAds } from "../http/tiktok-apis.js";
import { fetchGoogleAds } from "../http/google-apis.js";
import { generateProReport } from "../assistant/report-engine.js";
import { resolvePageId, extractPageSlugFromUrl, findPageDisplayName } from "../facebook/index.js";
import { syncBusinessData } from "../assistant/business-sync.js";
import { 
  saveCompetitorAdToDb, 
  saveMarketBenchmarkToDb,
  saveStrategicMemory,
  initPhase3Tables
} from "../core/db-state.js";
import { 
  getFormulaAuditTrail, 
  detectMetricAnomaly 
} from "../core/ad-math.js";


import { formatAds, resolvePageInfoOnce, gradeEmoji, fmtVND } from "./helpers.js";
import { getUserMetaAuth } from "../core/db-state.js";
import { getBusinessId } from "../cli/commands/shared.js";

export function createToolGroup(params: { api: OpenClawPluginApi; pluginConfig: AdsManagerPluginConfig; }): AnyAgentTool[] {
  const { api, pluginConfig } = params;
  const runtime = api.runtime;
  const logger = api.logger;
  const httpRequestTool: AnyAgentTool = {
    name: "http_request",
    label: "HTTP API Request",
    description: "Direct REST API call. Use for Meta Graph API, Buffer API, custom endpoints.",
    parameters: Type.Object({ url: Type.String(), method: Type.Optional(Type.String()), headers: Type.Optional(Type.String({ description: "JSON string" })), body: Type.Optional(Type.String()) }),
    execute: async (_id, raw: any) => {
      let h: Record<string, string> = {};
      if (raw.headers) { try { h = JSON.parse(raw.headers); } catch { /* ok */ } }
      const result = await httpFetch({ url: raw.url, method: raw.method ?? "GET", headers: h, body: raw.body });
      const bt = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
      return { content: [{ type: "text" as const, text: result.ok ? `✅ ${result.status}\n\n${bt}`.slice(0, 8000) : `❌ ${result.status} ${result.statusText}\n${result.error ?? bt.slice(0, 500)}` }], details: result };
    },
  };

  // ─ Tool 11: competitor_intelligence ─────────────────────────────────────────
  const competitorIntelligenceTool: AnyAgentTool = {
    name: "meta_ad_library",
    label: "Expert Cross-Platform Intelligence (Meta Ad Library)",
    description: "Scan competitor ads across Meta, TikTok, and Google. Detects 'Winners' (>14 days) and suggests deep analysis (demographics/budget).",
    parameters: Type.Object({
      brandName: Type.String({ description: "Competitor brand name (e.g. 'Long Việt Tax')" }),
      competitorUrl: Type.Optional(Type.String({ description: "Facebook, TikTok, or Website URL" })),
      country: Type.Optional(Type.String({ description: "2-letter code (default: VN)" })),
    }),
    execute: async (_id, raw: any) => {
      const country = safeStr(raw.country) ?? "VN";
      const brand = raw.brandName;
      let pageId = raw.competitorUrl?.match(/view_all_page_id=(\d+)/)?.[1];
      let brandName = brand;

      logger.info(`[intelligence] 🕵️ Starting Discovery Phase for "${brand}"...`);

      // 1. Discovery Phase: Find official Socials if not provided
      if (!pageId) {
        try {
          const searchRes = await serperSearch({ query: `${brand} Facebook Page`, limit: 5 });
          const fbLink = searchRes.find(r => 
            r.link.includes("facebook.com") && 
            !r.link.includes("/groups/") && 
            !r.link.includes("/posts/") && 
            !r.link.includes("/profile.php") &&
            !r.link.includes("/sharer/")
          )?.link;

          if (fbLink) {
            logger.info(`[intelligence] 🔗 Found potential Facebook Page: ${fbLink}`);
            const resolved = await resolvePageId(fbLink);
            if (resolved) {
              pageId = resolved.pageId;
              brandName = resolved.pageName || brandName;
              logger.info(`[intelligence] ✅ Resolved PageID: ${pageId} (${brandName})`);
            }
          }
        } catch (err) {
          logger.warn(`[intelligence] Discovery failed: ${err}. Falling back to name-only scan.`);
        }
      }

      // 2. High-Precision Parallel Scan
      logger.info(`[intelligence] 📡 Executing precision scan for "${brandName}" (ID: ${pageId || 'N/A'})...`);
      let results = await routeToActor({
        goal: "SCAN",
        query: brandName,
        pageId,
        country,
        config: pluginConfig,
        api
      }) as AdLibraryResult[];

      // 3. Automated Fallback: If precision scan (by ID) fails, try Broad Keyword Scan
      if ((!results || results.length === 0) && pageId) {
        logger.warn(`[intelligence] ⚠️ Precision scan for ID ${pageId} returned 0 results. Falling back to Broad Keyword Scan...`);
        results = await routeToActor({
          goal: "SCAN",
          query: brand,
          country,
          config: pluginConfig,
          api
        }) as AdLibraryResult[];
      }

      if (!results || results.length === 0) {
        // [FIX v2.0 - Anti-Hallucination Guard]
        // Không được tự suy đoán, tự sáng tác URL ảo, hay lấy Post Organic cũ để đắp vào.
        // Báo cáo chính xác: đối thủ đang TắT toàn bộ Quảng Cáo hoặc hạn phân tích.
        logger.warn(`[intelligence] ⚠️ Zero ads found for "${brand}" - reporting truthfully, NOT hallucinating.`);
        const noAdsMsg = [
          `🔎 **Kết Quả Quét Quảng Cáo: "${brand}"**`,
          `───────────────────────────`,
          `❌ **Kết Quả: 0 Quảng Cáo Đang Chạy**`,
          ``,
          `📊 **Phân Tích Nguyên Nhân Có Thể:**`,
          `  1. Đối thủ đang **Tạm Dừng Hoàn Toàn** toàn bộ chiến dịch (hết ngân sách / tắt camp)`,
          `  2. Đối thủ chưa có quảng cáo nào trong **90 ngày gần nhất** (bộ lọc thời gian khắt khe)`,
          `  3. Trang Facebook **không công khai** quảng cáo hoặc được bảo vệ bởi Meta`,
          ``,
          `✅ **Đây là kết quả chính xác 100% từ hệ thống.** Bot không đoán mò hay lấy dữ liệu cũ.`,
          ``,
          `💡 **Gợi ý tiếp theo:**`,
          `  • Thử lại sau 24h (có thể đối thủ đang tạm dừng và sắp bật lại)`,
          `  • Dùng \`/tim_kiem\` để quét rộng hơn theo từ khóa ngành hàng`,
        ].join("\n");
        return { 
          content: [{ type: "text" as const, text: noAdsMsg }], 
          details: { results: [], success: false, reason: "zero_active_ads", brand, pageId, timestamp: new Date().toISOString() } 
        };
      }

      // 2. Identify Winners (>14 days)
      const winners = results.filter(ad => (ad._runDays || 0) > 14);
      const winnerCount = winners.length;

      // 3. Save to DB & Strategic Memory
      for (const ad of results) {
        await saveCompetitorAdToDb(pluginConfig, {
          id: ad.id,
          platform: (ad.platforms?.[0] || "Meta") as any,
          pageName: ad.pageName || brand,
          hookText: ad.adText,
          durationDays: ad._runDays || 0,
          startedAt: ad.startDate
        });
      }

      const report = generateProReport({ targetName: brand, ads: results, platformStats: { "Combined": results.length } });
      
      let followUp = "";
      if (winnerCount > 0) {
        const pageId = winners[0].pageId;
        followUp = `\n\n🚩 **PHÁT HIỆN ${winnerCount} BÀI WINNER (>14 NGÀY)!**\nSếp có muốn em dùng 0.01$/ad để thám báo sâu về **Nhân khẩu học & Ngân sách** của đối thủ không? Trả lời "Duyệt" để em làm ngay ạ.`;
        
        // Create Proposal internal state (for UI/Dashboard tracking)
        if (pageId) {
          await createProposal({
            runtime, logger, pluginConfig,
            proposal: {
              title: `Phân tích sâu chiến dịch đối thủ: ${brand}`,
              summary: `Bóc tách dữ liệu nhân khẩu học (Demo) và ngân sách thực tế cho ${winnerCount} bài quảng cáo thâm niên của ${brand}. (Ước tính: 0.01$/ad)`,
              reason: "Phát hiện bài quảng cáo Winner (>14 ngày) cần phân tích sâu để tối ưu chiến thuật.",
              impact: "high",
              campaignId: pageId,
              commandHint: `/intel ${pageId}`
            }
          });
        }
      }

      return { 
        content: [{ type: "text" as const, text: report + followUp }], 
        details: { ads: results, winnerCount } 
      };
    },
  };

  // ─ Tool 12: meta_deep_intel ─────────────────────────────────────────────
  const metaDeepIntelTool: AnyAgentTool = {
    name: "meta_deep_intel",
    label: "Meta Ad Deep Intelligence (Demographics)",
    description: "EXPERT ONLY. Fetch Meta demographics (age, gender, region) and actual budget estimates for a Page. Use ONLY after user approval.",
    parameters: Type.Object({
      pageId: Type.String({ description: "Facebook Page ID" }),
    }),
    execute: async (_id, raw: any) => {
      logger.info(`[intel] 🧠 Executing deep dive for Page ID: ${raw.pageId}...`);
      const results = await metaDeepIntel({ 
        pageId: raw.pageId,
        config: pluginConfig
      });
      
      if (results.length === 0) return { content: [{ type: "text" as const, text: "❌ Không lấy được dữ liệu sâu. Có thể Page này không công khai nhân khẩu học." }], details: { success: false } };
      
      const first = results[0];
      let demoSummary = "📊 **KẾT QUẢ PHÂN TÍCH NHÂN KHẨU HỌC:**\n";
      if (first.demographics) {
        demoSummary += JSON.stringify(first.demographics, null, 2);
      }
      demoSummary += `\n\n💰 **ƯỚC TÍNH NGÂN SÁCH:** ${first.budgetEstimate || "Chưa rõ"}`;

      return { content: [{ type: "text" as const, text: demoSummary }], details: results };
    },
  };

  // ─ Tool 13: tiktok_intelligence ─────────────────────────────────────────────
  const tiktokIntelligenceTool: AnyAgentTool = {
    name: "apify_tiktok_ads",
    label: "TikTok Ads Intelligence (Apify)",
    description: "Search for competitor ads on TikTok Creative Center. Finds viral hooks and trending offers.",
    parameters: Type.Object({
      query: Type.String({ description: "Brand name or keyword" }),
      country: Type.Optional(Type.String({ description: "VN, US, etc." })),
      limit: Type.Optional(Type.Number()),
    }),
    execute: async (_id, raw: any) => {
      const results = await tiktokScraper({
        query: raw.query,
        country: raw.country ?? "VN",
        limit: raw.limit ?? 20,
        config: pluginConfig
      });
      if (results.length === 0) return { content: [{ type: "text" as const, text: "❌ Không tìm thấy quảng cáo TikTok nào." }], details: { results: [] } };
      return { content: [{ type: "text" as const, text: formatAds(results, "TikTok Library") }], details: results };
    },
  };

  // ─ Tool 14: google_ads_ocr ─────────────────────────────────────────────
  const googleAdsOcrTool: AnyAgentTool = {
    name: "google_ads_ocr",
    label: "Google Ads Image OCR",
    description: "Extract text and creative hooks from Google Ads images. Use ONLY when Sếp says 'Phân tích ảnh'.",
    parameters: Type.Object({
      adId: Type.String({ description: "Google Ad ID" }),
    }),
    execute: async (_id, raw: any) => {
      logger.info(`[ocr] 📸 Extracting text from Google Ad: ${raw.adId}...`);
      const text = await googleOcrScraper({ 
        adId: raw.adId,
        config: pluginConfig
      });
      if (!text) return { content: [{ type: "text" as const, text: "❌ Không trích xuất được chữ từ ảnh này." }], details: { adId: raw.adId, success: false } };
      return { content: [{ type: "text" as const, text: `📝 **NỘI DUNG TRÍCH XUẤT:**\n\n${text}` }], details: { adId: raw.adId, text, success: true } };
    },
  };

  // ─ Tool 12: serper_search ─────────────────────────────────────────────────
  const serperSearchTool: AnyAgentTool = {
    name: "serper_search",
    label: "Google Search (Serper)",
    description: "Google search via Serper. SERPER_API_KEY from env. type: search|news|images.",
    parameters: Type.Object({ query: Type.String(), type: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    execute: async (_id, raw: any) => {
      try {
        const results = await serperSearch({ query: raw.query, type: raw.type, limit: raw.limit ?? 10 });
        return { content: [{ type: "text" as const, text: `🔍 "${raw.query}":\n\n` + results.map((r, i) => `${i+1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`).join("\n\n") }], details: results };
      } catch (err) {
        console.error(`[serper_search] Fail: ${err}`);
        return { content: [{ type: "text" as const, text: `⚠️ Tìm kiếm thông qua Serper lỗi: ${err}. Em sẽ thử dùng công cụ tìm kiếm nội bộ khác.` }], details: { error: String(err) } };
      }
    },
  };

  // ─ Tool 13: resolve_facebook_page_id ─────────────────────────────────────
  const resolvePageIdTool: AnyAgentTool = {
    name: "resolve_facebook_page_id",
    label: "Resolve Facebook Page ID + Display Name",
    description: "Resolve URL → pageId + displayName (real page name). ALWAYS call before meta_ad_library for URLs. Returns BOTH pageId and displayName — both needed for VN market.",
    parameters: Type.Object({ url: Type.String({ description: "Facebook page URL or username" }) }),
    execute: async (_id, raw: any) => {
      const inputUrl = raw.url as string;
      const url = inputUrl.startsWith("http") ? inputUrl : `https://www.facebook.com/${inputUrl.replace(/^@/, "")}`;
      const slug = extractPageSlugFromUrl(url);
      const displayName = slug && !/^\d+$/.test(slug) ? await findPageDisplayName(slug) ?? undefined : undefined;

      if (slug && /^\d+$/.test(slug)) return { content: [{ type: "text" as const, text: `✅ Numeric: ${slug}\ndisplayName: "${displayName ?? "-"}"\n→ meta_ad_library(pageId: "${slug}")` }], details: { resolved: true, pageId: slug, displayName, method: "numeric_url", adLibraryUrl: buildAdLibraryUrl(slug, "ALL") } };

      let result = null;
      try { result = await resolvePageId(url); } catch (err) { return { content: [{ type: "text" as const, text: `❌ Error: ${err}` }], details: { error: String(err), resolved: false } }; }

      const finalDisplayName = displayName ?? safeStr(result?.pageName);
      if (!result) return { content: [{ type: "text" as const, text: [`⚠️ Không resolve pageId cho "${slug ?? inputUrl}".`, finalDisplayName ? `Display name tìm được: "${finalDisplayName}" → dùng cho Apify search` : "Display name: chưa tìm được", `Xem: https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(slug ?? inputUrl)}`, `→ meta_ad_library(pageUrl:"${url}") — sẽ dùng "${finalDisplayName ?? slug}" cho Apify`].filter(Boolean).join("\n") }], details: { resolved: false, slug, displayName: finalDisplayName, url } };

      const adLibUrl = buildAdLibraryUrl(result.pageId, "ALL");
      return { content: [{ type: "text" as const, text: [`✅ Resolved!`, `Page ID: ${result.pageId}`, `Page Name: ${safeStr(result.pageName) ?? "unknown"}`, `Display Name: ${finalDisplayName ?? "unknown"}`, `Method: ${result.method}`, ``, `→ meta_ad_library(pageId: "${result.pageId}", country: "VN")`, `→ Ad Library: ${adLibUrl}`].join("\n") }], details: { resolved: true, pageId: result.pageId, pageName: safeStr(result.pageName), displayName: finalDisplayName, method: result.method, slug, url, adLibraryUrl: adLibUrl } };
    },
  };

  // ─ Tool 14: meta_account_data ─────────────────────────────────────────────
  const metaAccountDataTool: AnyAgentTool = {
    name: "meta_account_data",
    label: "Meta Account Live Data (Own Account)",
    description: "Pull LIVE campaign data from YOUR Meta ad account via Marketing API v25. Returns spend, ROAS, CTR, CPA per campaign with health scores (0-100). Requires META_ACCESS_TOKEN + META_AD_ACCOUNT_ID in env.",
    parameters: Type.Object({
      datePreset: Type.Optional(Type.String({ description: "today|yesterday|last_3d|last_7d|last_30d|this_month (default: today)" })),
      status: Type.Optional(Type.String({ description: "all|active|paused (default: all)" })),
    }),
    execute: async (_id, raw: any) => {
      const businessId = (await getBusinessId(pluginConfig)) || pluginConfig.business.name;
      const auth = await getUserMetaAuth(pluginConfig, businessId);
      
      const token = auth?.access_token || process.env.META_ACCESS_TOKEN;
      const accountId = auth?.ad_account_id || raw.adAccountId || pluginConfig.meta.adAccountId;

      if (!token || !accountId) {
        return { 
          content: [{ 
            type: "text" as const, 
            text: [
              `❌ **THIẾU CẤU HÌNH CHO DOANH NGHIỆP: ${pluginConfig.business.name}**`,
              !token ? "  • Token Meta chưa được kết nối (Hãy dùng /ai để trợ lý hướng dẫn login)." : "",
              !accountId ? "  • Ad Account ID chưa được cấu hình." : "",
              ``,
              `Sếp hãy kiểm tra lại mục /cau_hinh ạ!`
            ].filter(Boolean).join("\n") 
          }], 
          details: { error: "missing_config", businessId } 
        };
      }

      const datePreset = (safeStr(raw.datePreset) ?? "today");
      const data = await fetchMetaAccountData({ 
        adAccountId: accountId, 
        accessToken: token, 
        datePreset 
      });
      if (!data) return { content: [{ type: "text" as const, text: `❌ Không lấy được data. Kiểm tra token và account ID.` }], details: { error: "api_failed" } };

      const filterFn = (c: MetaCampaignData) =>
        raw.status === "active" ? c.status === "active"
        : raw.status === "paused" ? c.status === "paused" : true;

      const sorted = data.campaigns.filter(filterFn).sort((a, b) => b.spend - a.spend);

      const campLines = sorted.map((c, i) => {
        const em = gradeEmoji(c.healthGrade);
        const fatigueWarn = c.fatigued ? " ⚠️ CREATIVE FATIGUE" : "";
        return [
          `${em} ${i+1}. ${c.name} [${c.status}] — Score: ${c.healthScore}/100 (${c.healthGrade})${fatigueWarn}`,
          `   Chi: ${fmtVND(c.spend)} / ${fmtVND(c.dailyBudget || c.lifetimeBudget)} (${((c.dailyBudget || c.lifetimeBudget) > 0 ? c.spend / (c.dailyBudget || c.lifetimeBudget) * 100 : 0).toFixed(0)}% pacing)`,
          `   ROAS: ${c.roas.toFixed(2)} | CPA: ${fmtVND(c.cpa)} | CTR: ${(c.ctr).toFixed(2)}%`,
          `   Clicks: ${c.clicks.toLocaleString()} | Impressions: ${c.impressions.toLocaleString()} | Frequency: ${c.frequency.toFixed(1)}`,
          c.purchases > 0 ? `   Purchases: ${c.purchases} | Revenue: ${fmtVND(c.revenue)}` : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const avgScore = sorted.length > 0 ? Math.round(sorted.reduce((s: number, c: MetaCampaignData) => s + c.healthScore, 0) / sorted.length) : 0;
      const avgGrade = avgScore >= 90 ? "A" : avgScore >= 75 ? "B" : avgScore >= 60 ? "C" : avgScore >= 40 ? "D" : "F";

      const summary = [
        `📊 LIVE DATA — ${data.accountName} (${datePreset})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `💳 Đã chi: ${fmtVND(data.amountSpent)} | Balance: ${fmtVND(data.balance)} | Spend Cap: ${data.spendCap > 0 ? fmtVND(data.spendCap) : "không giới hạn"}`,
        `🏥 Account Health: ${avgScore}/100 (Grade ${avgGrade}) ${gradeEmoji(avgGrade)}`,
        `📈 Campaigns: ${data.campaigns.length} total, ${sorted.length} shown`,
        ``,
        campLines || "(Không có campaigns)",
        ``,
        `→ /de_xuat để xem proposals | /pheduyet [id] để thực thi`,
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: data };
    },
  };

  return [
    httpRequestTool, 
    serperSearchTool, 
    competitorIntelligenceTool, 
    metaDeepIntelTool, 
    tiktokIntelligenceTool, 
    googleAdsOcrTool,
    resolvePageIdTool, 
    metaAccountDataTool
  ];
}
