/**
 * page-resolver.ts — v5 FINAL
 *
 * Resolves Facebook page URL → { pageId, pageName }
 * pageName is CRITICAL — used in ads_archive search_terms for VN market
 */

import { httpFetch } from "../http/client.js";

export type PageResolveResult = {
  pageId: string;
  pageName?: string;
  method?: string;
};

export function extractPageSlugFromUrl(url: string): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  // Cleanup query and hash
  const u = new URL(url.includes("://") ? url : `https://${url}`);
  let path = u.pathname;
  if (path.startsWith("/")) path = path.slice(1);
  if (path.endsWith("/")) path = path.slice(0, -1);
  
  const segments = path.split("/").filter(s => s && !["photos", "videos", "about", "posts", "shop", "reels", "community"].includes(s.toLowerCase()));
  if (segments.length === 0) return undefined;

  let slug = segments[0];

  // Handle profile.php?id=...
  if (slug === "profile.php") {
     return u.searchParams.get("id") || undefined;
  }

  // Common non-slug segments to skip
  const skip = ["pages", "people", "business", "groups", "adslibrary", "ads"];
  if (skip.includes(slug.toLowerCase()) && segments.length > 1) {
    slug = segments[1];
  }

  return slug || undefined;
}

export async function findPageDisplayName(slug: string): Promise<string | null> {
  const token = process.env.META_ACCESS_TOKEN;
  if (token) {
    try {
      const url = `https://graph.facebook.com/v19.0/${slug}?fields=name&access_token=${token}`;
      const r = await httpFetch({ url, timeoutMs: 5000 });
      if (r.ok && (r.data as any)?.name) return (r.data as any).name;
    } catch (err) { /* ignore */ }
  }

  // Fallback: Try Scraping the Ad Library page to find the name
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&q=${encodeURIComponent(slug)}`;
    const r = await httpFetch({ url, timeoutMs: 15000 });
    if (r.ok && r.rawText) {
      const mName = r.rawText.match(/"pageName":"([^"]+)"/);
      if (mName?.[1]) return mName[1];
      
      // Try generic HTML title or other patterns if pageName match fails
      const titleMatch = r.rawText.match(/<title>(.*?)<\/title>/i);
      if (titleMatch?.[1]) {
        const title = titleMatch[1].split("|")[0].trim();
        if (title && !title.toLowerCase().includes("ads library")) return title;
      }
    }
  } catch { /* ok */ }

  return null;
}

async function tryGraphApi(slug: string, accessToken: string): Promise<PageResolveResult | null> {
  try {
    const url = `https://graph.facebook.com/v19.0/${slug}?fields=id,name&access_token=${accessToken}`;
    const r = await httpFetch({ url, timeoutMs: 8000 });
    if (r.ok && (r.data as any)?.id) {
       return { pageId: String((r.data as any).id), pageName: (r.data as any).name };
    }
  } catch { /* ok */ }
  return null;
}

async function trySerperAdLibrary(slug: string, serperKey: string): Promise<PageResolveResult | null> {
  const q = `"facebook.com/ads/library" "${slug}" "view_all_page_id"`;
  try {
    const r = await httpFetch({
      url: "https://google.serper.dev/search",
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: { q, num: 10 },
      timeoutMs: 10000
    });
    if (r.ok && Array.isArray((r.data as any)?.organic)) {
      for (const result of (r.data as any).organic) {
        const link = String(result.link || "");
        const m = link.match(/view_all_page_id=(\d+)/);
        if (m?.[1]) return { pageId: m[1], pageName: undefined }; // Name not in URL
      }
    }
  } catch { /* ok */ }
  return null;
}

async function tryAdLibraryScrape(slug: string): Promise<PageResolveResult | null> {
   const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&is_targeted_country=false&media_type=all&search_type=page&q=${encodeURIComponent(slug)}`;
   try {
     const r = await httpFetch({ url, timeoutMs: 15000 });
     if (r.ok && r.rawText) {
       // High-precision ID matches
       const mId = r.rawText.match(/"pageID":"(\d+)"/) || 
                   r.rawText.match(/"delegate_page_id":"(\d+)"/) ||
                   r.rawText.match(/page_id=(\d+)/);
       
       const mName = r.rawText.match(/"pageName":"([^"]+)"/);
       if (mId?.[1]) return { pageId: mId[1], pageName: mName?.[1] };
     }
   } catch { /* ok */ }
   return null;
}

async function tryHtmlScrape(url: string, slug: string): Promise<PageResolveResult | null> {
  try {
    const r = await httpFetch({ url, timeoutMs: 10000 });
    if (r.ok && r.rawText) {
      // Look for pageID or delegate_page_id in profile HTML
      const mId = r.rawText.match(/"pageID":"(\d+)"/) || 
                  r.rawText.match(/"delegate_page_id":"(\d+)"/) ||
                  r.rawText.match(/"page_id":"(\d+)"/) ||
                  r.rawText.match(/fb:\/\/page\/(\d+)/);
                  
      if (mId?.[1]) return { pageId: mId[1], pageName: undefined };
    }
  } catch { /* ok */ }
  return null;
}

export async function resolvePageId(url: string): Promise<PageResolveResult | null> {
  const slug = extractPageSlugFromUrl(url);
  if (!slug) return null;

  if (/^\d+$/.test(slug)) {
    // For numeric slugs, we have the ID, but we still want the NAME for better searching
    const result: PageResolveResult = { pageId: slug, method: "numeric_url" };
    const name = await findPageDisplayName(slug);
    if (name) result.pageName = name;
    return result;
  }

  // M1: User Token
  const userToken = process.env.META_ACCESS_TOKEN;
  if (userToken) {
    const r = await tryGraphApi(slug, userToken);
    if (r) return { ...r, method: "graph_api_user" };
  }

  // M2: App Token
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (appId && appSecret) {
    const r = await tryGraphApi(slug, `${appId}|${appSecret}`);
    if (r) return { ...r, method: "graph_api_app" };
  }

  // M3: Serper
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    const r = await trySerperAdLibrary(slug, serperKey);
    if (r) return { ...r, method: "serper_strict" };
  }

  // M4: Scrape
  const r4 = await tryAdLibraryScrape(slug);
  if (r4) return { ...r4, method: "ad_library_scrape" };

  // M5: HTML
  const r5 = await tryHtmlScrape(url, slug);
  if (r5) return { ...r5, method: "html_scrape" };

  return null;
}
