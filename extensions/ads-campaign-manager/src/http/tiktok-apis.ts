import { httpFetch } from "./client.js";
import type { AdLibraryResult } from "./types.js";

/**
 * TikTok Ad Library Scraper via Apify
 */
export async function fetchTikTokAds(params: {
  query: string;
  country?: string;
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return [];

  const { query, country = "VN", limit = 5 } = params;

  try {
    // Official Premium TikTok Ads Scraper (apify/tiktok-ads-library-scraper)
    const runRes = await httpFetch({
      url: `https://api.apify.com/v2/acts/apify~tiktok-ads-library-scraper/runs?token=${token}&waitSecs=20`,
      method: "POST",
      body: {
        searchQueries: [query],
        country: country,
        maxRecords: limit,
        maxItems: limit,
        activeStatus: "active"
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
          adText: String(item.ad_text || item.text || item.description || "").trim(),
          status: "ACTIVE",
          startDate: item.start_date || item.first_shown_date || "",
          pageName: item.advertiser_name || item.brand_name || query,
          snapshotUrl: item.ad_url || item.snapshot_url,
          imageUrl: item.image_url || item.video_thumbnail_url,
          videoUrl: item.video_url,
          platforms: ["TikTok"],
          ctaType: item.cta_text || "Learn More"
        }));
      }
    }
  } catch (err) {
    console.warn(`[http-fetch] TikTok scrape fail: ${err}`);
  }
  return [];
}
