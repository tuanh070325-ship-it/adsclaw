import { resolvePageId, extractPageSlugFromUrl } from "../facebook/index.js";
import { httpFetch, safeStr, calcHealthScore } from "./client.js";
import type { AdLibraryResult, MetaAccountData, MetaCampaignData } from "./types.js";

export function isValidAdLibraryUrl(url: string): boolean {
  return url.includes("facebook.com/ads/library") && url.includes("view_all_page_id=");
}

export function buildAdLibraryUrl(idOrKeyword: string, country = "VN"): string {
  const isPageId = /^\d+$/.test(idOrKeyword);
  const baseUrl = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all";
  const params = [
    `country=${country}`,
    "is_targeted_country=false",
    "media_type=all",
    "sort_data[direction]=desc",
    "sort_data[mode]=total_impressions"
  ];

  if (isPageId) {
    params.push("search_type=page");
    params.push(`view_all_page_id=${idOrKeyword}`);
  } else {
    params.push("search_type=keyword_unordered");
    params.push(`q=${encodeURIComponent(idOrKeyword)}`);
  }

  return `${baseUrl}&${params.join("&")}`;
}

export function buildSpecificAdUrl(adId: string): string {
  return `https://www.facebook.com/ads/library/?id=${adId}`;
}

const GRAPH_FIELDS = [
  "id", "ad_creation_time", "ad_creative_bodies", "ad_creative_link_captions", "ad_creative_link_titles",
  "ad_delivery_start_time", "ad_delivery_stop_time", "ad_snapshot_url", "funding_entity",
  "impressions", "page_id", "page_name", "publisher_platforms", "spend",
  "demographic_distribution", "region_distribution"
].join(",");

export async function fetchFacebookAdLibrary(params: {
  pageId?: string; pageUrl?: string; pageName?: string;
  accessToken?: string; limit?: number; country?: string; graphVersion?: string;
  adType?: string;
}): Promise<AdLibraryResult[]> {
  const graphVersion = params.graphVersion ?? "v23.0";
  const token = params.accessToken ?? process.env.META_ACCESS_TOKEN;
  const country = params.country ?? "VN";
  const limit = params.limit ?? 5;

  let slug = safeStr(params.pageId);
  if (!slug && params.pageUrl) slug = extractPageSlugFromUrl(params.pageUrl);
  if (!slug) throw new Error("Cannot determine page identifier.");

  // Internal tracking

  let numericId: string | undefined;
  let resolvedName = safeStr(params.pageName);

  if (/^\d+$/.test(slug)) {
    numericId = slug;
  } else {
    const resolved = await resolvePageId(params.pageUrl ?? `https://www.facebook.com/${slug}`);
    if (resolved) {
      numericId = resolved.pageId;
      resolvedName = safeStr(resolved.pageName) ?? resolvedName;
    }
  }

  if (!token) return [];

  const searchName = resolvedName ?? slug;
  // Internal tracking

  const url = new URL(`https://graph.facebook.com/${graphVersion}/ads_archive`);
  url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
  url.searchParams.set("ad_active_status", "ALL");
  const adType = params.adType ?? "POLITICAL_AND_ISSUE_ADS";
  url.searchParams.set("ad_type", adType);
  url.searchParams.set("fields", GRAPH_FIELDS);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("search_terms", searchName);
  if (numericId) url.searchParams.set("search_page_ids", numericId);
  url.searchParams.set("access_token", token);

  const r = await httpFetch({ url: url.toString(), timeoutMs: 20000 });
  if (!r.ok) {
    const code = ((r.data as Record<string, unknown>)?.error as Record<string, unknown>)?.code;
    return [];
  }

  const ads = ((r.data as Record<string, unknown>).data as Record<string, unknown>[]) ?? [];
  // Internal tracking

  return ads.map(ad => ({
    id: String(ad.id ?? ""),
    pageId: safeStr(ad.page_id) ?? "",
    pageName: safeStr(ad.page_name) ?? "",
    adText: Array.isArray(ad.ad_creative_bodies) ? (ad.ad_creative_bodies as string[]).join(" | ") : "",
    linkTitles: Array.isArray(ad.ad_creative_link_titles) ? (ad.ad_creative_link_titles as string[]) : [],
    status: "ACTIVE",
    adCreationTime: safeStr(ad.ad_creation_time),
    startDate: safeStr(ad.ad_delivery_start_time),
    endDate: safeStr(ad.ad_delivery_stop_time),
    snapshotUrl: safeStr(ad.ad_snapshot_url),
    impressions: ad.impressions,
    platforms: Array.isArray(ad.publisher_platforms) ? (ad.publisher_platforms as string[]) : [],
    spend: ad.spend as any,
    demographics: ad.demographic_distribution as any[],
    regions: ad.region_distribution as any[],
    fundingEntity: safeStr(ad.funding_entity),
  }));
}

export async function fetchMetaAccountData(params: {
  adAccountId?: string; accessToken?: string;
  datePreset?: string; graphVersion?: string;
}): Promise<MetaAccountData | null> {
  const graphVersion = params.graphVersion ?? "v23.0";
  const token = params.accessToken ?? process.env.META_ACCESS_TOKEN;
  const rawId = params.adAccountId ?? process.env.META_AD_ACCOUNT_ID;
  if (!token || !rawId) return null;
  const accountId = rawId.startsWith("act_") ? rawId : `act_${rawId}`;
  const datePreset = params.datePreset ?? "today";
  // Internal tracking

  const accountUrl = new URL(`https://graph.facebook.com/${graphVersion}/${accountId}`);
  accountUrl.searchParams.set("fields", "id,name,amount_spent,spend_cap,balance,currency");
  accountUrl.searchParams.set("access_token", token);
  const accountR = await httpFetch({ url: accountUrl.toString(), timeoutMs: 15000 });
  if (!accountR.ok) {
    return null;
  }
  const accountData = accountR.data as Record<string, unknown>;

  const campUrl = new URL(`https://graph.facebook.com/${graphVersion}/${accountId}/campaigns`);
  campUrl.searchParams.set("fields", [
    "id", "name", "status", "daily_budget", "lifetime_budget",
    `insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values}`,
  ].join(","));
  campUrl.searchParams.set("limit", "250");
  campUrl.searchParams.set("access_token", token);

  const campR = await httpFetch({ url: campUrl.toString(), timeoutMs: 20000 });
  const campaigns: MetaCampaignData[] = [];

  if (campR.ok) {
    const campData = ((campR.data as Record<string, unknown>).data ?? []) as Record<string, unknown>[];
    for (const camp of campData) {
      const ins = ((camp.insights as Record<string, unknown>)?.data as Record<string, unknown>[])?.[0] ?? {};
      const spend = parseFloat(String(ins.spend ?? 0));
      const impressions = parseInt(String(ins.impressions ?? 0), 10);
      const clicks = parseInt(String(ins.clicks ?? 0), 10);
      const ctr = parseFloat(String(ins.ctr ?? 0));
      const cpc = parseFloat(String(ins.cpc ?? 0));
      const cpm = parseFloat(String(ins.cpm ?? 0));
      const frequency = parseFloat(String(ins.frequency ?? 0));
      const dailyBudget = parseInt(String(camp.daily_budget ?? 0), 10) / 100;
      const lifetimeBudget = parseInt(String(camp.lifetime_budget ?? 0), 10) / 100;

      const actions = Array.isArray(ins.actions) ? ins.actions as Record<string, unknown>[] : [];
      const actionValues = Array.isArray(ins.action_values) ? ins.action_values as Record<string, unknown>[] : [];
      const purchaseTypes = ["purchase", "offsite_conversion.fb_pixel_purchase"];
      const purchases = actions.filter(a => purchaseTypes.includes(String(a.action_type))).reduce((s, a) => s + parseInt(String(a.value ?? 0), 10), 0);
      const revenue = actionValues.filter(a => purchaseTypes.includes(String(a.action_type))).reduce((s, a) => s + parseFloat(String(a.value ?? 0)), 0);
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : 0;
      const fatigued = frequency > 3.0 && ctr < 1.0;

      const partial = { spend, roas, ctr, cpa, dailyBudget, status: String(camp.status ?? "").toLowerCase() };
      const { score: healthScore, grade: healthGrade } = calcHealthScore(partial);

      campaigns.push({
        id: String(camp.id ?? ""),
        name: String(camp.name ?? ""),
        status: String(camp.status ?? "").toLowerCase(),
        dailyBudget, lifetimeBudget,
        spend, impressions, clicks, ctr, cpc, cpm, frequency,
        purchases, revenue, roas, cpa,
        healthScore, healthGrade, fatigued,
      });
    }
  }

  return {
    accountId: String(accountData.id ?? accountId),
    accountName: String(accountData.name ?? "Ad Account"),
    amountSpent: parseFloat(String(accountData.amount_spent ?? 0)),
    spendCap: parseFloat(String(accountData.spend_cap ?? 0)),
    balance: parseFloat(String(accountData.balance ?? 0)),
    currency: String(accountData.currency ?? "VND"),
    campaigns,
  };
}
