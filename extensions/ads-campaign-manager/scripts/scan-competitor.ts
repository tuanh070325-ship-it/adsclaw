import { routeToActor } from "../src/core/actor-router.js";
import { generateProReport } from "../src/assistant/report-engine.js";
import type { AdLibraryResult } from "../src/http/types.js";

async function main() {
  const brand = "chạm vân - cổ mộc tiệm";
  console.log(`🔍 [REAL SCAN] Đang thám báo đối thủ: ${brand}...`);

  try {
    const results = await routeToActor({
      goal: "SCAN",
      query: brand,
      country: "VN",
      config: {} as any,
      api: { logger: console } as any
    });

    if (!results || (Array.isArray(results) && results.length === 0)) {
      console.log(`❌ Không tìm thấy quảng cáo nào cho "${brand}".`);
      return;
    }

    if (Array.isArray(results)) {
      // Calculate run days for real results
      results.forEach(ad => {
        if (ad.startDate) {
          (ad as any)._runDays = Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86400000);
        }
      });

      const report = generateProReport({
        targetName: brand,
        ads: results as AdLibraryResult[],
        platformStats: { "Combined": results.length }
      });

      console.log("\n=== BÁO CÁO THỰC TẾ ===");
      console.log(report);
      
      const winners = (results as AdLibraryResult[]).filter(ad => (ad._runDays || 0) > 14);
      if (winners.length > 0) {
        console.log(`\n🚩 **PHÁT HIỆN ${winners.length} BÀI WINNER (>14 NGÀY)!**`);
        console.log(`Sếp có muốn em dùng 0.01$/ad để thám báo sâu về Nhân khẩu học & Ngân sách không? Trả lời "Duyệt" để em làm ngay ạ.`);
      }
    }
  } catch (err) {
    console.error("❌ Lỗi khi quét:", err);
  }
}

main();
