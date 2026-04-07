import { serperSearch } from "../src/http/search-apis.js";
import { resolvePageId } from "../src/facebook/page-resolver.js";
import { routeToActor } from "../src/core/actor-router.js";
import { generateProReport } from "../src/assistant/report-engine.js";
import type { AdLibraryResult } from "../src/http/types.js";

async function expertScan(query: string) {
  console.log(`🧠 [EXPERT REAL SCAN] 🔍 Tìm kiếm dấu vết của: ${query}...`);

  try {
    // Stage 1: Find the Socials
    const searchResults = await serperSearch({ query: `${query} Facebook`, type: "search", limit: 5 });
    const fbLink = searchResults.find(r => r.link.includes("facebook.com"))?.link;

    let pageId: string | undefined;
    let brandName = query;

    if (fbLink) {
      console.log(`🔗 Tìm thấy Facebook: ${fbLink}`);
      // Stage 2: Resolve Page ID
      const resolved = await resolvePageId(fbLink);
      if (resolved) {
        pageId = resolved.pageId;
        brandName = resolved.pageName || brandName;
        console.log(`✅ Đã resolve: PageID=${pageId}, Brand=${brandName}`);
      }
    }

    // Stage 3: Scan for Ads
    console.log(`📡 Đang quét quảng cáo cho ${brandName} (PageID: ${pageId || 'N/A'})...`);
    const results = await routeToActor({
      goal: "SCAN",
      query: brandName,
      pageId,
      country: "VN",
      config: {} as any,
      api: { logger: console } as any
    });

    if (!results || (Array.isArray(results) && results.length === 0)) {
      console.log(`\n=== BÁO CÁO KẾT QUẢ QUÉT ===`);
      const report = generateProReport({
        targetName: brandName,
        ads: [],
        platformStats: {}
      });
      console.log(report);
      return;
    }

    if (Array.isArray(results)) {
       // Mock runDays for consistency
       results.forEach(ad => {
        if (ad.startDate) {
          (ad as any)._runDays = Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86400000);
        }
      });

      const report = generateProReport({
        targetName: brandName,
        ads: results as AdLibraryResult[],
        platformStats: { "Combined": results.length }
      });

      console.log("\n=== BÁO CÁO KẾT QUẢ QUÉT ===");
      console.log(report);
      
      const winners = (results as AdLibraryResult[]).filter(ad => (ad._runDays || 0) > 14);
      if (winners.length > 0) {
        console.log(`\n🚩 **PHÁT HIỆN ${winners.length} BÀI WINNER (>14 NGÀY)!**`);
        console.log(`Sếp có muốn em dùng 0.01$/ad để thám báo sâu không? Trả lời "Duyệt" để em làm ngay ạ.`);
      }
    }
  } catch (err) {
    console.error("❌ Lỗi trong quá trình quét chuyên gia:", err);
  }
}

expertScan("Long Việt Tax - Quyết toán thuế trọn gói");
