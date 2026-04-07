import { httpFetch, safeStr } from "./client.js";
import { isValidAdLibraryUrl, buildAdLibraryUrl, buildSpecificAdUrl } from "./meta-apis.js";
import { extractPageSlugFromUrl, findPageDisplayName } from "../facebook/index.js";
import type { AdLibraryResult } from "./types.js";
import { executeQuery } from "../core/db.js";

// [FIX v2.0] Giảm từ 365 → 90 ngày: chỉ lấy dữ liệu quý gần nhất (preventing stale 2020 ads)
const MAX_AD_AGE_DAYS = 90;

// Helper to parse relative dates from Facebook/Apify like "30 days ago", "Today"
export function parseApifyDate(dateStr: string): number {
  if (!dateStr) return NaN;
  const lower = dateStr.toLowerCase().trim();
  const now = Date.now();
  if (lower.includes("today") || lower.includes("hôm nay")) return now;
  if (lower.includes("yesterday") || lower.includes("hôm qua")) return now - 86400000;
  
  const daysMatch = lower.match(/(\d+)\s*(days?|ngày)\s*(ago|trước)?/);
  if (daysMatch) return now - parseInt(daysMatch[1], 10) * 86400000;
  
  const hrsMatch = lower.match(/(\d+)\s*(hours?|hrs?|giờ)\s*(ago|trước)?/);
  if (hrsMatch) return now - parseInt(hrsMatch[1], 10) * 3600000;

  const minsMatch = lower.match(/(\d+)\s*(minutes?|mins?|phút)\s*(ago|trước)?/);
  if (minsMatch) return now - parseInt(minsMatch[1], 10) * 60000;

  return new Date(dateStr).getTime();
}

// [FIX v2.0] Strict Date Filter - không nới lỏng cho dữ liệu thiếu/sai ngày tháng
function filterRecentAds(ads: AdLibraryResult[]): AdLibraryResult[] {
  const now = Date.now();
  const maxAgeMs = MAX_AD_AGE_DAYS * 24 * 60 * 60 * 1000;
  // Epoch sanity: reject dates before 2020-01-01 (Apify sometimes returns epoch 0 = 1970)
  const MIN_VALID_TIMESTAMP = new Date("2020-01-01").getTime();
  
  return ads.filter(ad => {
    if (!ad.startDate) return false;
    try {
      const start = parseApifyDate(ad.startDate);
      if (isNaN(start) || start < MIN_VALID_TIMESTAMP) return false;
      
      // Normalize to ISO to fix downstream math parsing bugs
      ad.startDate = new Date(start).toISOString();
      
      return (now - start) < maxAgeMs;
    } catch {
      return false;
    }
  });
}

import type { AdsManagerPluginConfig } from "../core/types.js";

interface ApifyRunData {
  id: string;
  defaultDatasetId: string;
  status: string;
  usage?: {
    totalUsd?: number;
  };
}

// Helper to prevent token burning by sending all possible limit field names
export function getShotgunLimitParams(limit: number) {
  return {
    limit,
    maxAds: limit,
    maxItems: limit,
    maxRecords: limit,
    resultsLimit: limit,
    count: limit,
    limitPerSource: limit,
    maxResults: limit,
    item_limit: limit,
    max_results: limit, // Thẩm thấu thêm cho các Actor đời cũ
    max_items: limit,
    maxPages: Math.ceil(limit / 10) || 1,
  };
}

export async function apifyFacebookAdsScraper(params: {
  url: string;
  config: AdsManagerPluginConfig;
  pageId?: string;
  pageName?: string;
  limit?: number;
  country?: string;
}): Promise<AdLibraryResult[]> {
  const token = params.config.intelligence?.apify?.apiToken ?? process.env.APIFY_TOKEN;
  // Sếp: Chốt cứng giới hạn 20-50 để tiết kiệm tiền.
  const limit = Math.min(params.limit ?? 5, 10);
  const country = params.country ?? "ALL";
  const safePageId = safeStr(params.pageId);
  const safePageName = safeStr(params.pageName);
  const urlPageId = params.url.match(/view_all_page_id=(\d+)/)?.[1];
  const effectivePageId = safePageId ?? urlPageId;

  // 1.5 Try EnsembleData (NEW High-Precision Source)
  if (effectivePageId) {
    try {
      const ensAds = await ensembleDataScraper({ pageId: effectivePageId, limit, country });
      if (ensAds.length > 0) {
        console.log(`[http-fetch] ✅ EnsembleData returned ${ensAds.length} high-precision ads`);
        return ensAds;
      }
    } catch (err) {
      console.log(`[http-fetch] ⚠️ EnsembleData failed: ${err}`);
    }
  }

  if (!token) {
    console.log("[http-fetch] ⚠️ APIFY_TOKEN not found, skipping fallback scrapers.");
    return [];
  }

  let displayName = safePageName;
  const adLibUrl = effectivePageId 
    ? buildAdLibraryUrl(effectivePageId, country === "ALL" ? "VN" : country) 
    : (displayName ? buildAdLibraryUrl(displayName, country === "ALL" ? "VN" : country) : null);

  const slug = extractPageSlugFromUrl(params.url);

  if (!displayName && slug && !/^\d+$/.test(slug)) {
    const found = await findPageDisplayName(slug);
    if (found) displayName = found;
  }

  // Bug #2 Fix: If we have a query but no pageId/adLibUrl, ensure displayName is the query
  if (!effectivePageId && !displayName && params.pageName) {
    displayName = params.pageName;
  }

  // DEBUG: Why are we skipping?
  console.log(`[http-fetch] ℹ️ Apify Prep: adLibUrl=${adLibUrl ? "SET" : "MISSING"} displayName="${displayName || "MISSING"}" effectivePageId=${effectivePageId || "MISSING"}`);

  type Actor = { id: string; label: string; input: Record<string, unknown>; skip?: boolean };

  const actors: Actor[] = [
    {
      id: "curious_coder/facebook-ads-library-scraper",
      label: "curious_coder/facebook-ads-library-scraper (Pro #1)",
      input: {
        startUrls: [{ url: adLibUrl || `https://www.facebook.com/ads/library/?active_status=active&country=${country === "ALL" ? "VN" : country}&q=${encodeURIComponent(displayName || "")}&search_type=keyword_unordered` }],
        ...getShotgunLimitParams(limit),
        proxyConfiguration: { 
          useApifyProxy: true,
          apifyProxyGroups: ["RESIDENTIAL"] 
        }
      },
      skip: !adLibUrl && !displayName,
    },
    {
      id: "apify/facebook-ads-scraper",
      label: "apify/facebook-ads-scraper (Official Flagship)",
      input: { 
        startUrls: [{ url: adLibUrl || `https://www.facebook.com/ads/library/?active_status=active&country=${country === "ALL" ? "VN" : country}&q=${encodeURIComponent(displayName || "")}&search_type=keyword_unordered` }],
        ...getShotgunLimitParams(limit),
        includeAboutPage: false,
        isDetailsPerAd: false,
        activeStatus: "active",
        proxyConfiguration: { 
          useApifyProxy: true, 
          apifyProxyGroups: ["RESIDENTIAL"],
          apifyProxyCountry: country === "VN" ? "VN" : undefined 
        }
      },
      skip: !adLibUrl && !displayName,
    },
    {
      id: "webdatalabs/meta-ad-library-scraper",
      label: "webdatalabs/meta-ad-library-scraper (Vietnam Proxy)",
      input: { 
        searchQueries: [adLibUrl || displayName || safePageId], 
        country: country || "VN", 
        ...getShotgunLimitParams(limit),
        activeStatus: "active",
        onlyActive: true
      },
      skip: !adLibUrl && !displayName && !safePageId,
    }
  ];

  const activeRuns: { actor: Actor; runId: string; datasetId: string; status: string }[] = [];

  // STEP 1: Waterfall Trigger (Sequential for Cost Saving)
  console.log(`[http-fetch] 🌊 Sequential triggering ${actors.filter(a => !a.skip).length} Apify actors (Waterfall Mode)...`);
  
  for (const actor of actors) {
    if (actor.skip) continue;
    try {
      console.log(`[http-fetch] 🚀 Triggering ${actor.label}...`);
      const triggerUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actor.id)}/runs?token=${token}`;
      const tr = await httpFetch({ 
        url: triggerUrl, 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: actor.input, 
        timeoutMs: 30000 
      });
      
      if (!tr.ok) {
        console.log(`[http-fetch] ⚠️ Trigger fail for ${actor.label}: ${tr.status}`);
        continue; // Try next actor in waterfall
      }

      const runInfo = ((tr.data as Record<string, unknown>)?.data as Record<string, unknown>) ?? {};
      const runId = safeStr(runInfo?.id);
      const datasetId = safeStr(runInfo?.defaultDatasetId);
      
      if (!runId || !datasetId) continue;

      // STEP 2: Poll THIS actor until success
      console.log(`[http-fetch] ⏱️ Polling ${actor.label} (ID: ${runId})...`);
      const startTime = Date.now();
      const maxWaitMs = 120000; 

      while (Date.now() - startTime < maxWaitMs) {
        const sr = await httpFetch({ url: `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, timeoutMs: 15000 });
        const status = safeStr(((sr.data as Record<string, unknown>)?.data as Record<string, unknown>)?.status);
        
        if (status === "SUCCEEDED") {
          // Log Cost
          const runData = (sr.data as any)?.data as ApifyRunData;
          const usageUsd = Number(runData?.usage?.totalUsd || 0);
          const businessId = Buffer.from(params.config.business.name).toString("base64").slice(0, 64);
          
          const { logApifyCost } = await import("./apify-cost-tracker.js");
          await logApifyCost({
            config: params.config,
            businessId,
            actorId: actor.id,
            actorLabel: actor.label,
            runId: runData.id,
            usageUsd
          });
          
          const dr = await httpFetch({ url: `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=${limit}`, timeoutMs: 20000 });
          if (dr.ok && Array.isArray(dr.data) && dr.data.length > 0) {
            const rawItems = dr.data as Record<string, unknown>[];
            const filteredItems = rawItems.filter(item => {
              const itmId = safeStr(item.pageID) ?? safeStr(item.page_id) ?? safeStr(item.advertiser_id) ?? safeStr(item.pageId) ?? safeStr(item.page_archive_id);
              const itmName = safeStr(item.pageName) ?? safeStr(item.page_name) ?? safeStr(item.advertiserName) ?? safeStr(item.pageTitle) ?? safeStr(item.page_title);
              if (effectivePageId && itmId) return itmId === effectivePageId;
              if (displayName && itmName) {
                const cleanTarget = displayName.toLowerCase().replace(/\s+/g, " ").trim();
                const cleanItem = itmName.toLowerCase().replace(/\s+/g, " ").trim();
                return cleanItem === cleanTarget || cleanItem.startsWith(cleanTarget) || cleanTarget.startsWith(cleanItem);
              }
              return false;
            });

            if (filteredItems.length > 0) {
              console.log(`[http-fetch] ✅ ${actor.label} found ${filteredItems.length} ads. WATERFALL STOP.`);
              const results = filteredItems.map(item => {
                const idExt = safeStr(item.pageID) ?? safeStr(item.page_id) ?? safeStr(item.advertiser_id) ?? safeStr(item.pageId) ?? safeStr(item.page_archive_id);
                const nameExt = safeStr(item.pageName) ?? safeStr(item.page_name) ?? safeStr(item.advertiserName) ?? safeStr(item.pageTitle) ?? safeStr(item.page_title);
                return {
                  id: String(item.id ?? item.adId ?? item.adArchiveID ?? Math.random()),
                  adText: String(safeStr(item.adText) ?? safeStr(item.body) ?? safeStr(item.text) ??
                    (Array.isArray(item.adCreativeBodies) ? (item.adCreativeBodies as string[]).join(" | ") : "") ?? "").trim(),
                  status: "ACTIVE",
                  pageName: nameExt || displayName || "Unknown",
                  pageId: idExt || effectivePageId || "",
                  startDate: safeStr(item.startDate) ?? safeStr(item.adCreationDate) ?? safeStr(item.adDeliveryStartTime) ?? "",
                  endDate: safeStr(item.endDate) ?? safeStr(item.adDeliveryStopTime) ?? "",
                  imageUrl: safeStr(item.imageUrl) ?? (Array.isArray(item.imageUrls) ? safeStr((item.imageUrls as unknown[])[0]) : undefined),
                  videoUrl: safeStr(item.videoUrl) ?? (Array.isArray(item.videoUrls) ? safeStr((item.videoUrls as unknown[])[0]) : undefined),
                  platforms: Array.isArray(item.platforms) ? (item.platforms as string[]) : [],
                  ctaType: safeStr(item.ctaText) ?? safeStr(item.ctaType) ?? "",
                  linkTitles: Array.isArray(item.adCreativeLinkTitles) ? (item.adCreativeLinkTitles as string[]) : [],
                  impressions: item.impressions,
                  snapshotUrl: safeStr(item.adSnapshotUrl),
                  libraryUrl: item.id || item.adId || item.adArchiveID ? buildSpecificAdUrl(String(item.id ?? item.adId ?? item.adArchiveID)) : undefined,
                };
              });

              // Bug #3: Apply Date Filtering
              return filterRecentAds(results);
            }
          }
          break; // This actor finished but found nothing, try next one
        }
        
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status || "")) break;
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (err) {
      console.log(`[http-fetch] ⚠️ Waterfall error for ${actor.label}: ${err}`);
    }
  }

  console.log(`[http-fetch] 🚩 All Apify runs in waterfall finished or timed out without finding ads.`);
  return [];
}

export async function scrapeCreatorsIndustrySearch(params: {
  query: string;
  config: AdsManagerPluginConfig;
  country?: string;
  platform?: string; // FB, IG
  limit?: number;
}): Promise<AdLibraryResult[]> {
  // PIVOT: Always use Apify for industry search as requested.
  return apifyFacebookAdsScraper({
    url: `https://www.facebook.com/ads/library/?active_status=active&country=${params.country || "VN"}&q=${encodeURIComponent(params.query)}&search_type=keyword_unordered`,
    config: params.config,
    limit: params.limit,
    country: params.country,
    pageName: params.query
  });
}

export async function ensembleDataScraper(params: {
  pageId: string;
  limit?: number;
  country?: string;
}): Promise<AdLibraryResult[]> {
  const key = process.env.ENSEMBLEDATA_API_KEY;
  if (!key || key === "placeholder_please_fill") {
    return [];
  }

  try {
    // EnsembleData API Endpoint
    const url = new URL("https://api.ensembledata.com/facebook/ads-library/get-ads-by-page-id");
    url.searchParams.set("page_id", params.pageId);
    
    const res = await httpFetch({
      url: url.toString(),
      method: "GET",
      headers: { "x-api-key": key },
      timeoutMs: 30000
    });

    if (res.ok) {
      let items = (res.data as any)?.data || (res.data as any)?.results || [];
      if (Array.isArray(items) && items.length > 0) {
        // [FIX v2.0] Apply limit before processing to prevent memory waste
        if (params.limit) items = items.slice(0, params.limit);
        console.log(`[http-fetch] ✅ EnsembleData returned ${items.length} raw ads (before date filter)`);
        const mapped = items.map((item: Record<string, unknown>) => ({
          id: String((item.id as string) || (item.ad_archive_id as string) || Math.random()),
          adText: String((item.adText as string) || (item.text as string) || (item.body as string) || ((item.snapshot as any)?.body?.text as string) || "").trim(),
          status: "ACTIVE",
          pageName: (item.pageName as string) || (item.page_name as string) || "",
          pageId: (item.pageId as string) || (item.page_id as string) || params.pageId,
          startDate: (item.startDate as string) || (item.start_date as string) || "",
          endDate: (item.endDate as string) || (item.end_date as string) || "",
          imageUrl: (item.imageUrl as string) || ((item.snapshot as any)?.images?.[0]?.original_image_url as string) || ((item.imageUrls as string[])?.[0]),
          videoUrl: (item.videoUrl as string) || ((item.snapshot as any)?.videos?.[0]?.video_hd_url as string) || ((item.videoUrls as string[])?.[0]),
          platforms: (item.platforms as string[]) || (item.publisher_platforms as string[]) || [],
          ctaType: (item.ctaText as string) || (item.ctaType as string) || ((item.snapshot as any)?.cta_text as string) || "",
          snapshotUrl: (item.adSnapshotUrl as string) || (item.snapshot_url as string) || (item.id ? buildSpecificAdUrl(String(item.id)) : undefined),
          libraryUrl: item.id || item.ad_archive_id ? buildSpecificAdUrl(String((item.id as string) || (item.ad_archive_id as string))) : undefined,
        }));
        // [FIX v2.0] Apply date filter same as other scrapers - strict 90-day window
        const filtered = filterRecentAds(mapped);
        console.log(`[http-fetch] ✅ EnsembleData after date filter: ${filtered.length}/${mapped.length} ads (90-day window)`);
        return filtered;
      }
    }
  } catch (err) {
    console.error(`[http-fetch] EnsembleData error: ${err}`);
  }
  return [];
}

export async function metaFastScraper(params: {
  config: AdsManagerPluginConfig;
  pageId?: string;
  pageName?: string;
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const token = params.config.intelligence?.apify?.apiToken ?? process.env.APIFY_TOKEN;
  if (!token) return [];

  const input = {
    searchQueries: params.pageId ? [`https://www.facebook.com/ads/library/?view_all_page_id=${params.pageId}`] : [params.pageName],
    resultsLimit: Math.min(params.limit ?? 5, 10),
    maxItems: Math.min(params.limit ?? 5, 10),
    activeStatus: "active"
  };

  try {
    const res = await triggerApifyAndGetItems("hello-datawizards/Facebook-Ad-Scraper", input, token, input.maxItems, params.config);
    const results = res.map(item => ({
      id: String(item.id || item.adId || Math.random()),
      adText: String(item.adText || item.text || "").trim(),
      status: "ACTIVE",
      pageName: String(item.pageName || params.pageName || ""),
      pageId: String(item.pageId || params.pageId || ""),
      startDate: String(item.startDate || ""),
      endDate: String(item.endDate || ""),
      imageUrl: String(item.imageUrl || ""),
      videoUrl: String(item.videoUrl || ""),
      platforms: Array.isArray(item.platforms) ? item.platforms : ["Meta"],
      snapshotUrl: String(item.adSnapshotUrl || ""),
    }));
    return filterRecentAds(results);
  } catch (err) {
    console.error(`[metaFastScraper] Error: ${err}`);
    return [];
  }
}

export async function multiChannelMonitor(params: {
  config: AdsManagerPluginConfig;
  query: string;
  limit?: number;
  countries?: string[];
}): Promise<AdLibraryResult[]> {
  const limit = Math.min(params.limit ?? 5, 10);
  
  // Waterfall multi-channel search
  const results: AdLibraryResult[] = [];
  
  // 1. Meta (Pro)
  const metaAds = await apifyFacebookAdsScraper({
    url: "",
    config: params.config,
    pageName: params.query,
    limit,
    country: params.countries?.[0]
  });
  results.push(...metaAds);
  
  // 2. TikTok (Pro)
  if (results.length < limit) {
    const ttAds = await tiktokScraper({
      config: params.config,
      query: params.query,
      country: params.countries?.[0],
      limit: limit - results.length
    });
    results.push(...ttAds);
  }

  // 3. Google (Pro)
  if (results.length < limit) {
    const token = params.config.intelligence?.apify?.apiToken ?? process.env.APIFY_TOKEN;
    if (token) {
      try {
        const gAds = await triggerApifyAndGetItems(
          "silva95gustavo/google-ads-scraper",
          {
            queries: [params.query],
            ...getShotgunLimitParams(limit - results.length)
          },
          token,
          limit - results.length,
          params.config
        );
        results.push(...gAds.map(item => ({
          id: String(item.id || Math.random()),
          adText: String(item.text || item.title || "").trim(),
          status: "ACTIVE",
          pageName: String(item.advertiserName || ""),
          platforms: ["Google"],
          startDate: String(item.firstShown || "")
        })));
      } catch (e) { /* ignore google fail */ }
    }
  }

  return results.slice(0, limit);
}

export async function metaDeepIntel(params: {
  config: AdsManagerPluginConfig;
  pageId: string;
}): Promise<AdLibraryResult[]> {
  const token = params.config.intelligence?.apify?.apiToken ?? process.env.APIFY_TOKEN;
  if (!token) return [];

  const input = {
    pageId: params.pageId,
    ...getShotgunLimitParams(10),
    includeDemographics: true,
    includeBudget: true
  };

  try {
    const res = await triggerApifyAndGetItems("alizarin_refrigerator-owner/meta-ad-library-facebook-instagram-ad-intelligence", input, token, 10, params.config);
    const results = res.map(item => ({
      id: String(item.id || Math.random()),
      adText: String(item.adText || "").trim(),
      status: "ACTIVE",
      pageId: params.pageId,
      demographics: item.demographics,
      budgetEstimate: item.budgetEstimate || item.spend_range,
      isWinner: true // Usually used for deep dive on winners
    }));
    return filterRecentAds(results);
  } catch (err) {
    console.error(`[metaDeepIntel] Error: ${err}`);
    return [];
  }
}

export async function tiktokScraper(params: {
  config: AdsManagerPluginConfig;
  query: string;
  country?: string;
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const token = params.config.intelligence?.apify?.apiToken ?? process.env.APIFY_TOKEN;
  if (!token) return [];

  const input = {
    searchQueries: [params.query],
    countryCode: params.country ?? "VN",
    ...getShotgunLimitParams(Math.min(params.limit ?? 5, 10))
  };

  try {
    // PIVOT to beyondops for better industry/objective filtering if needed in future
    const res = await triggerApifyAndGetItems("beyondops/tiktok-ad-library-scraper", input, token, 10, params.config);
    const results = res.map(item => ({
      id: String(item.id || item.ad_id || Math.random()),
      adText: String(item.ad_text || item.text || "").trim(),
      status: "ACTIVE",
      pageName: String(item.advertiser_name || ""),
      pageId: String(item.advertiser_id || ""),
      platforms: ["TikTok"],
      videoUrl: String(item.video_url || ""),
      imageUrl: String(item.cover_url || ""),
      startDate: String(item.create_time || item.started_at || ""),
      industry: item.industry_name,
      objective: item.objective_name
    }));
    return filterRecentAds(results);
  } catch (err) {
    console.error(`[tiktokScraper] Error: ${err}`);
    return [];
  }
}

export async function googleOcrScraper(params: {
  config: AdsManagerPluginConfig;
  adId: string;
}): Promise<string | null> {
  const token = params.config.intelligence?.apify?.apiToken ?? process.env.APIFY_TOKEN;
  if (!token) return null;

  const input = {
    adIds: [params.adId],
    ...getShotgunLimitParams(1),
    extractText: true
  };

  try {
    const res = await triggerApifyAndGetItems("silva95gustavo/google-ads-scraper", input, token, 1, params.config);
    return res[0]?.ocrText || res[0]?.extractedText || null;
  } catch (err) {
    console.error(`[googleOcrScraper] Error: ${err}`);
    return null;
  }
}

async function triggerApifyAndGetItems(actorId: string, input: any, token: string, limit: number = 5, config?: AdsManagerPluginConfig): Promise<any[]> {
  const triggerUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${token}`;
  const tr = await httpFetch({
    url: triggerUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: input,
    timeoutMs: 30000
  });

  if (!tr.ok) throw new Error(`Apify trigger failed: ${tr.status}`);

  const runInfo = (tr.data as any).data;
  const runId = runInfo.id;
  const datasetId = runInfo.defaultDatasetId;

  // Poll for completion (max 2 mins)
  const startTime = Date.now();
  while (Date.now() - startTime < 120000) {
    const sr = await httpFetch({ url: `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, timeoutMs: 15000 });
    const runData = (sr.data as any)?.data as ApifyRunData;
    const status = runData?.status;
    
    if (status === "SUCCEEDED") {
      // Log Cost
      if (config) {
        try {
          const usageUsd = Number(runData?.usage?.totalUsd || 0);
          const businessId = Buffer.from(config.business.name).toString("base64").slice(0, 64);
          const { logApifyCost } = await import("./apify-cost-tracker.js");
          await logApifyCost({
            config,
            businessId,
            actorId,
            actorLabel: actorId, // Simplified label here
            runId,
            usageUsd
          });
        } catch (e) { /* ignore cost logging error */ }
      }

      const dr = await httpFetch({ url: `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=${limit}`, timeoutMs: 20000 });
      return Array.isArray(dr.data) ? dr.data : [];
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) throw new Error(`Apify run failed: ${status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("Apify run timed out");
}
