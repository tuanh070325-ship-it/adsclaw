import { httpFetch } from "./client.js";

export async function serperSearch(params: {
  query: string; apiKey?: string; type?: "search" | "news" | "images"; limit?: number;
}): Promise<Array<{ title: string; link: string; snippet: string; position?: number }>> {
  const key = params.apiKey ?? process.env.SERPER_API_KEY;
  if (!key) {
    console.warn("[http-fetch] SERPER_API_KEY missing from environment.");
    return [];
  }
  const endpoint = params.type === "news" ? "https://google.serper.dev/news"
    : params.type === "images" ? "https://google.serper.dev/images"
    : "https://google.serper.dev/search";
  const r = await httpFetch({ url: endpoint, method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: { q: params.query, num: params.limit ?? 5 },
    timeoutMs: 10000 });
  if (!r.ok) {
    console.error(`[http-fetch] Serper failed (${r.status}): ${r.rawText}`);
    return [];
  }
  const d = r.data as Record<string, unknown>;
  const items = (d.organic ?? d.news ?? d.images ?? []) as Record<string, unknown>[];
  return items.map(i => ({
    title: String(i.title ?? ""), link: String(i.link ?? ""),
    snippet: String(i.snippet ?? i.description ?? ""),
    position: typeof i.position === "number" ? i.position : undefined,
  }));
}

export async function searchApiSearch(params: {
  query: string; apiKey?: string; engine?: string; limit?: number;
}): Promise<Array<{ title: string; link: string; snippet: string; position?: number }>> {
  const key = params.apiKey ?? process.env.SEARCHAPI_API_KEY;
  if (!key) {
    console.warn("[http-fetch] SEARCHAPI_API_KEY missing from environment.");
    return [];
  }
  const engine = params.engine ?? "google";
  const endpoint = "https://www.searchapi.io/api/v1/search";
  
  const url = new URL(endpoint);
  url.searchParams.set("q", params.query);
  url.searchParams.set("engine", engine);
  url.searchParams.set("api_key", key);
  url.searchParams.set("num", String(params.limit ?? 5));

  const r = await httpFetch({ url: url.toString(), method: "GET", timeoutMs: 15000 });
  if (!r.ok) {
    console.error(`[http-fetch] SearchAPI failed (${r.status}): ${r.rawText}`);
    return [];
  }
  const d = r.data as Record<string, unknown>;
  const items = (d.organic_results ?? []) as Record<string, unknown>[];
  return items.map(i => ({
    title: String(i.title ?? ""), link: String(i.link ?? ""),
    snippet: String(i.snippet ?? ""),
    position: typeof i.position === "number" ? i.position : undefined,
  }));
}

export async function googleAdsSearch(params: {
  query: string; domain?: string; apiKey?: string; limit?: number;
}): Promise<any[]> {
  const key = params.apiKey ?? process.env.SEARCHAPI_API_KEY;
  if (!key) return [];

  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "google_ads_transparency_center");
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", params.query);
  if (params.domain) url.searchParams.set("domain", params.domain);
  url.searchParams.set("location", "Vietnam");
  url.searchParams.set("num", String(params.limit ?? 5));

  const r = await httpFetch({ url: url.toString(), method: "GET", timeoutMs: 15000 });
  if (!r.ok) return [];

  const d = r.data as Record<string, unknown>;
  const ads = (d.ads ?? []) as Record<string, unknown>[];
  return ads.map(ad => {
    const a = ad as any;
    return {
      id: String(a.creative_id || Math.random()),
      advertiserName: String(a.advertiser_name || ""),
      title: String(a.title || ""),
      link: String(a.link || ""),
      snippet: String(a.snippet || ""),
      format: a.ad_format,
      platform: "GOOGLE",
      targeting: {
        locations: a.audience_selection?.geographic_locations,
        demographics: a.audience_selection?.demographic_info,
        context: a.audience_selection?.contextual_signals,
      }
    };
  });
}
