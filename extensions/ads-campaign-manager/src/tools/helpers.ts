import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { findPageDisplayName, resolvePageId, extractPageSlugFromUrl } from "../facebook/index.js";
import { scrapeCreatorsIndustrySearch, googleAdsSearch, httpFetch, safeStr } from "../http/index.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import { loadAssistantContext } from "../assistant/index.js";
import type { AdLibraryResult } from "../http/index.js";

// -- Type Exports
export const BRIEF_MODES = ["report","overview","alerts","budget","plan","proposals","competitors"] as const;
export type BriefMode = typeof BRIEF_MODES[number];

export function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({ type: "string", enum: [...values], description });
}

export function buildPayload(mode: BriefMode, ctx: Awaited<ReturnType<typeof loadAssistantContext>>) {
  const pending = ctx.state.proposals.filter(p => p.status === "pending");
  switch (mode) {
    case "overview": return { mode, health: ctx.derived.health, generatedAt: ctx.derived.generatedAt, lastSyncAt: ctx.state.lastSyncAt, alerts: ctx.derived.alerts.length, winners: ctx.derived.winners.length, watchlist: ctx.derived.watchlist.length, atRisk: ctx.derived.atRisk.length, operations: ctx.operations, warnings: ctx.warnings };
    case "alerts": return { mode, alerts: ctx.derived.alerts, operations: ctx.operations, warnings: ctx.warnings };
    case "budget": return { mode, budget: ctx.derived.budget, operations: ctx.operations, winners: ctx.derived.winners.map(v => ({ id: v.campaign.id, name: v.campaign.name, roas: v.campaign.roas, ctr: v.campaign.ctr })) };
    case "plan": return { mode, dailyTasks: ctx.derived.dailyTasks, bossInstructions: ctx.state.instructions.slice(0, 5), operations: ctx.operations };
    case "proposals": return { mode, pending, all: ctx.state.proposals, operations: ctx.operations };
    case "competitors": return { mode, competitors: ctx.snapshot?.competitors ?? [], notes: ctx.snapshot?.notes ?? [], operations: ctx.operations };
    default: return { mode: "report", business: ctx.config.business, health: ctx.derived.health, generatedAt: ctx.derived.generatedAt, budget: ctx.derived.budget, alerts: ctx.derived.alerts, pendingProposals: pending, topWinner: ctx.derived.winners[0]?.campaign, topRisk: ctx.derived.atRisk[0]?.campaign, dailyTasks: ctx.derived.dailyTasks, operations: ctx.operations, warnings: ctx.warnings };
  }
}

export function daysRunning(s: string | undefined): string {
  if (!s || s === "undefined") return "?";
  try { const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000); return d >= 0 ? String(d) : "?"; }
  catch { return "?"; }
}

export function formatAds(ads: AdLibraryResult[], source: string): string {
  if (ads.length === 0) return `### 📉 [${source}] Không tìm thấy quảng cáo nào đang chạy.`;

  const rows = ads.map((ad, i) => {
    const hook = (ad.adText ?? "").slice(0, 80).replace(/\n/g, " ").trim();
    const days = daysRunning(ad.startDate);
    const startDate = ad.startDate ? ad.startDate.split("T")[0] : "N/A";
    const cta = ad.ctaType || "None";
    const link = ad.libraryUrl ? `[Link](${ad.libraryUrl})` : "N/A";
    const platformIcons = (ad.platforms || []).map(p => p === "FACEBOOK" ? "🔵" : p === "INSTAGRAM" ? "📸" : "📱").join("");
    
    return `| ${i + 1} | ${days}d | ${startDate} | ${platformIcons} | ${cta} | ${hook}... | ${link} |`;
  });

  const table = [
    `| # | Lived | Start | Platform | CTA | Hook Snippet | Meta Link |`,
    `|---|-------|-------|----------|-----|--------------|-----------|`,
    ...rows
  ].join("\n");

  return `### 📊 [${source}] TRÍCH XUẤT ${ads.length} ADS\n\n${table}`;
}

export function fmtVND(n: number): string {
  return n > 0 ? `${Math.round(n).toLocaleString("vi-VN")}đ` : "0đ";
}

export function gradeEmoji(grade: string): string {
  return grade === "A" ? "🟢" : grade === "B" ? "🔵" : grade === "C" ? "🟡" : grade === "D" ? "🟠" : "🔴";
}

export async function performIndustryDiscovery(args: { keyword: string; config: AdsManagerPluginConfig; country?: string; platform?: string; limit?: number }) {
  const { keyword, config, country = "VN", platform = "FB", limit = 10 } = args;
  
  if (platform === "GOOGLE") {
    const googleAds = await googleAdsSearch({ query: keyword, limit });
    return formatGoogleAds(googleAds, keyword);
  }

  const ads = await scrapeCreatorsIndustrySearch({ query: keyword, config, country, platform, limit });
  return formatIndustryAds(ads, keyword, platform);
}

export function formatGoogleAds(ads: any[], keyword: string): string {
  if (ads.length === 0) return `### 📊 [Google Ads: ${keyword}] Không tìm thấy bài quảng cáo nào.`;

  const rows = ads.map((ad, i) => {
    return `| ${i + 1} | **${ad.advertiserName}** | ${ad.title} | ${ad.snippet.slice(0, 100)}... | [Xem Link](${ad.link}) |`;
  });

  const table = [
    `| # | Advertiser | Title | Snippet | Link |`,
    `|---|------------|-------|---------|------|`,
    ...rows
  ].join("\n");

  return `## 🚀 GOOGLE ADS: NGÀNH ${keyword.toUpperCase()}\n\n${table}\n\n> [!NOTE]\n> Dữ liệu được trích xuất từ Google Ads Transparency.`;
}

export function formatIndustryAds(ads: AdLibraryResult[], keyword: string, platform?: string): string {
  const platformName = platform === "IG" ? "INSTAGRAM" : platform === "GOOGLE" ? "GOOGLE" : "FACEBOOK";
  const icon = platform === "IG" ? "📸" : platform === "GOOGLE" ? "🔍" : "🔵";

  if (ads.length === 0) return `### 📉 [${platformName}: ${keyword}] Không tìm thấy bài quảng cáo Winning nào.`;

  const rows = ads.map((ad, i) => {
    const days = (ad as any)._runDays !== undefined ? String((ad as any)._runDays) : daysRunning(ad.startDate);
    const startDate = ad.startDate ? ad.startDate.split("T")[0] : "N/A";
    const cta = ad.ctaType || "-";
    const link = ad.libraryUrl ? `[Xem Link](${ad.libraryUrl})` : "N/A";
    const page = ad.pageName ? `**${ad.pageName}**` : "Unknown";

    return `| ${i + 1} | ${days}d | ${startDate} | ${page} | ${cta} | ${link} |`;
  });

  const table = [
    `| # | Độ bền | Ngày bắt đầu | Nhà quảng cáo | CTA | Link Thám Báo |`,
    `|---|--------|--------------|---------------|-----|---------------|`,
    ...rows
  ].join("\n");

  return `## ${icon} WINNING ADS: ${platformName} — NGÀNH ${keyword.toUpperCase()}\n\n${table}`;
}

// ─── Resolve ONCE per request ─────────────────────────────────────────────────

export async function resolvePageInfoOnce(url: string, knownPageId?: string, accessToken?: string): Promise<{
  pageId: string | undefined;
  pageName: string | undefined;
  displayName: string | undefined;
  method: string | undefined;
  slug: string | undefined;
}> {
  const slug = extractPageSlugFromUrl(url);

  if (knownPageId && /^\d+$/.test(knownPageId)) {
    // Phase 21: Skip Meta API for competitor name resolution to avoid permission/verification blocks
    const displayName = slug && !/^\d+$/.test(slug) ? await findPageDisplayName(slug) ?? undefined : undefined;
    return { pageId: knownPageId, pageName: displayName, displayName, method: "numeric_input", slug };
  }

  // Fallthrough to the full resolvePageId logic
  let resolved = null;
  try { resolved = await resolvePageId(url); } catch { /* ok */ }

  const pageName = safeStr(resolved?.pageName);
  const displayName = pageName ?? (slug ? await findPageDisplayName(slug) ?? undefined : undefined);
  return { pageId: safeStr(resolved?.pageId), pageName, displayName, method: resolved?.method, slug };
}

export async function checkSystemHealth(config: AdsManagerPluginConfig) {
  const results: string[] = [];
  
  // 1. Meta Token (Live Ping Test - Phase 25)
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    results.push("❌ META_ACCESS_TOKEN: Missing");
  } else {
    try {
      const pingUrl = `https://graph.facebook.com/v19.0/me?access_token=${token}`;
      const r = await httpFetch({ url: pingUrl, timeoutMs: 5000 });
      if (r.ok) {
        results.push("✅ META_ACCESS_TOKEN: Active & Valid (Ping Success)");
      } else {
        const err = (r.data as any)?.error?.message || r.statusText;
        results.push(`❌ META_ACCESS_TOKEN: Invalid or Expired (${err})`);
      }
    } catch (err) {
      results.push(`⚠️ META_ACCESS_TOKEN: DNS/Network error during Ping (${err})`);
    }
  }

  // 2. Search API
  const searchKey = process.env.SEARCHAPI_API_KEY || process.env.SERPER_API_KEY;
  if (!searchKey) results.push("❌ SEARCH_API_KEY: Missing (Search/Google Ads disabled)");
  else results.push(`✅ SEARCH_API_KEY: Active (${process.env.SEARCHAPI_API_KEY ? "SearchAPI" : "Serper"})`);

  // 3. ScrapeCreators
  const scKey = process.env.SCRAPECREATORS_API_KEY;
  if (!scKey) results.push("⚠️ SCRAPECREATORS_API_KEY: Missing (Industry Discovery limited)");
  else results.push("✅ SCRAPECREATORS_API_KEY: Active");

  // 4. Database
  if (config.database?.enabled) results.push("✅ DATABASE: Enabled (MySQL/Postgres persistence)");
  else results.push("ℹ️ DATABASE: Disabled (Local JSON mode)");

  return results.join("\n");
}
