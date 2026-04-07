import { httpFetch } from "./client.js";
import type { AdLibraryResult } from "./types.js";

/**
 * Google Ads Transparency Scraper via Apify
 */
export async function fetchGoogleAds(params: {
  query: string;
  country?: string;
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return [];

  const { query, country = "VN", limit = 5 } = params;

  try {
    // Apify Google Ads Scraper (apify/google-ads-transparency-scraper)
    const runRes = await httpFetch({
      url: `https://api.apify.com/v2/acts/apify~google-ads-transparency-scraper/runs?token=${token}&waitSecs=20`,
      method: "POST",
      body: {
        searchTerms: [query],
        country: country,
        maxAds: limit,
        maxItems: limit
      }
    });

    if (runRes.ok) {
      const datasetId = (runRes.data as any)?.data?.defaultDatasetId;
      if (!datasetId) return [];

      const dataRes = await httpFetch({
        url: `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=${limit}`,
        method: "GET"
      });

      if (dataRes.ok && Array.isArray(dataRes.data)) {
        return (dataRes.data as any[]).map(item => ({
          id: String(item.id || item.ad_id || Math.random()),
          adText: String(item.title || item.text || item.description || "").trim(),
          status: "ACTIVE",
          startDate: item.first_shown || "",
          pageName: item.advertiser_name || query,
          snapshotUrl: item.ad_url || item.snapshot_url,
          imageUrl: item.image_url,
          videoUrl: item.video_url,
          platforms: ["Google"],
          ctaType: "Visit Site"
        }));
      }
    }
  } catch (err) {
    console.warn(`[http-fetch] Google scrape fail: ${err}`);
  }
  return [];
}
