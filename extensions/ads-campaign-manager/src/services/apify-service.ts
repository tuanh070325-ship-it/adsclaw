import { getApifyMcpClient } from "./apify-mcp-client.js";
import type { AdsManagerPluginConfig, PostEngagementData } from "../core/types.js";
import type { AdLibraryResult } from "../http/types.js";

/**
 * apify-service.ts — High-level bridge to MCP
 * ───────────────────────────────────────────────────
 * This service restores the missing `analyzeCompetitorAdsWithApify` 
 * function used by campaign-tools.ts and search-tools.ts.
 */

export async function analyzeCompetitorAdsWithApify(params: {
  config: AdsManagerPluginConfig;
  searchQuery: string;
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const { searchQuery, limit = 10 } = params;
  
  try {
    const mcp = await getApifyMcpClient();
    
    // We use the official apify/facebook-ads-scraper via MCP
    const result = await mcp.callTool("call-actor", {
      actorId: "apify/facebook-ads-scraper",
      input: {
        // Scraper accepts URL, ID, or search query
        q: searchQuery,
        maxItems: limit,
        proxyConfiguration: { useApifyProxy: true }
      }
    });

    // Content is usually an array of objects for this actor
    if (result.content && Array.isArray(result.content)) {
      const first = result.content[0];
      if (first.type === 'text' && first.text) {
          try {
              const data = JSON.parse(first.text);
              if (Array.isArray(data)) return data as AdLibraryResult[];
          } catch {
              // Not JSON, return empty
          }
      }
    }
    
    return [] as AdLibraryResult[];
  } catch (error: any) {
    console.error(`[ApifyBridge] Analysis failed: ${error.message}`);
    return [];
  }
}

/**
 * getPostEngagement — Fetches social signals for a specific Facebook/Instagram post.
 * Restored for use in competitor analysis workflows.
 */
export async function getPostEngagement(params: {
  config: AdsManagerPluginConfig;
  postUrl: string;
}): Promise<PostEngagementData> {
  const generatedAt = new Date().toISOString();
  try {
    const mcp = await getApifyMcpClient();
    
    // Using apify/facebook-post-scraper or similar via MCP
    const result = await mcp.callTool("call-actor", {
      actorId: "apify/facebook-post-scraper",
      input: {
        startUrls: [{ url: params.postUrl }],
        resultsLimit: 1
      }
    });

    if (result.content && Array.isArray(result.content)) {
      const first = result.content[0];
      if (first.type === 'text' && first.text) {
        const data = JSON.parse(first.text);
        const item = Array.isArray(data) ? data[0] : data;
        
        if (item) {
          return {
            postUrl: params.postUrl,
            likes: Number(item.likesCount || item.likes || 0),
            comments: Number(item.commentsCount || item.comments || 0),
            shares: Number(item.sharesCount || item.shares || 0),
            isVideo: !!(item.videoUrl || item.isVideo),
            postText: String(item.text || item.postText || ""),
            scrapedAt: generatedAt,
            source: "apify"
          };
        }
      }
    }
  } catch (error: any) {
    console.error(`[ApifyBridge] Failed to get post engagement: ${error.message}`);
  }

  // Fallback / Default
  return {
    postUrl: params.postUrl,
    likes: 0,
    comments: 0,
    shares: 0,
    isVideo: false,
    postText: "",
    scrapedAt: generatedAt,
    source: "proxy_model" // Using proxy_model as fallback source
  };
}
