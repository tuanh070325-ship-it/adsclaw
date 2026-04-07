import type { AdLibraryResult } from "../http/types.js";
import { fmtVND } from "../tools/helpers.js";

/**
 * Generates a 'Pro' level Strategic Intelligence Report
 * Optimized for Phase 3: Reporting & Visualization
 */
export function generateProReport(params: {
  targetName: string;
  ads: AdLibraryResult[];
  platformStats: Record<string, number>;
}): string {
  const { targetName, ads, platformStats } = params;

  // 1. Professional Fallback for 0 Ads
  if (ads.length === 0) {
    return [
      `# 📜 BÁO CÁO THÁM BÁO CHIẾN LƯỢC: ${targetName.toUpperCase()}`,
      `> *Cập nhật lúc: ${new Date().toLocaleString('vi-VN')}*`,
      ``,
      `## 🔍 TRẠNG THÁI: KHÔNG TÌM THẤY DỮ LIỆU`,
      `Em đã quét toàn bộ hệ thống Meta, TikTok và Google nhưng **chưa tìm thấy quảng cáo nào đang chạy** cho đối thủ này.`,
      ``,
      `### 💡 Gợi ý cho Sếp:`,
      `- **Kiểm tra Fanpage chính thức**: Có thể đối thủ đã đổi tên Page hoặc đang dùng Page vệ tinh.`,
      `- **Quét theo từ khóa**: Sếp thử tìm theo tên sản phẩm thay vì tên Brand.`,
      `- **Chờ đợi**: Có thể họ đang tạm dừng camp để chuẩn bị cho đợt bùng nổ mới.`,
      ``,
      `---`,
      `*Trợ lý sẽ tiếp tục theo dõi, nếu đối thủ "lên sóng" em sẽ báo Sếp ngay!*`
    ].join("\n");
  }

  // 1. Header & Executive Summary
  const report = [
    `# 📜 BÁO CÁO THÁM BÁO CHIẾN LƯỢC: ${targetName.toUpperCase()}`,
    `> *Cập nhật lúc: ${new Date().toLocaleString('vi-VN')}*`,
    ``,
    `## 📊 TỔNG QUAN ĐA NỀN TẢNG (OVERVIEW)`,
    `Đối thủ đang hiển thị trên các kênh sau:`,
  ];

  // Platform Icons & Counts
  for (const [p, count] of Object.entries(platformStats)) {
    const icon = p === "Meta" ? "🔵" : p === "TikTok" ? "⚫" : p === "Google" ? "🔴" : "🔍";
    report.push(`- ${icon} **${p}:** ${count} bài quảng cáo đang hoạt động`);
  }
  report.push(``);

  // 2. High-Precision Data Table
  report.push(`## 🏆 TOP CHIẾN DỊCH CHIẾN THẮNG (WINNER LIST)`);
  report.push(`*Các bài quảng cáo có độ bền cao (>14 ngày), tiềm năng lợi nhuận lớn.*`);
  report.push(``);
  report.push(`| Status | Ad ID | Nền tảng | Độ dài | Ngân sách | Hook/Offer chính |`);
  report.push(`|:-------|:------|:---------|:-------|:----------|:-----------------|`);

  // Sort by duration (days)
  const sortedAds = ads.sort((a, b) => (b._runDays || 0) - (a._runDays || 0));

  for (const ad of sortedAds.slice(0, 10)) {
    const platform = ad.platforms?.[0] || "Meta";
    const duration = ad._runDays ? `${ad._runDays} ngày` : "Mới";
    const isWinner = (ad._runDays || 0) > 14;
    const winnerStatus = isWinner ? "🔥 **WINNER**" : "✅ Active";
    const hook = ad.adText.length > 50 ? `${ad.adText.substring(0, 47)}...` : ad.adText;
    const budget = ad.budgetEstimate || "N/A";
    
    report.push(`| ${winnerStatus} | \`${ad.id.slice(0, 8)}\` | ${platform} | ${duration} | ${budget} | ${hook.replace(/\n|\|/g, ' ')} |`);
  }
  report.push(``);

  // 3. Deep Intelligence (Demographics & Budget) - Only if available
  const adsWithIntel = ads.filter(a => a.demographics || a.budgetEstimate || a.ocrText);
  if (adsWithIntel.length > 0) {
    report.push(`## 🧠 THÁM BÁO CHUYÊN SÂU (DEEP INTEL)`);
    report.push(`*Dữ liệu bóc tách từ lớp Demographics & Spend Estimates của Apify.*`);
    report.push(``);
    
    const first = adsWithIntel.find(a => a.demographics) || adsWithIntel[0];
    if (first.demographics) {
      report.push(`### 👥 Nhân khẩu học (Demographics)`);
      report.push("```json");
      report.push(JSON.stringify(first.demographics, null, 2));
      report.push("```");
    }
    
    const ocrAd = adsWithIntel.find(a => a.ocrText);
    if (ocrAd?.ocrText) {
      report.push(`### 📸 Trích xuất chữ (OCR)`);
      report.push(`> **Hook từ ảnh:** "${ocrAd.ocrText}"`);
    }
    report.push(``);
  }

  // 4. Strategic Recommendations
  report.push(`## 🚀 ĐỀ XUẤT CHIẾN LƯỢC (PRO RECOMMENDATIONS)`);
  
  const topWinner = sortedAds[0];
  if (topWinner && (topWinner._runDays || 0) > 14) {
    report.push(`- 🔥 **Sao chép Hook:** Bài ID \`${topWinner.id.slice(0, 6)}\` đã chạy được ${topWinner._runDays} ngày. Sếp nên cân nhắc sử dụng Hook tương tự: *${extractHookForRec(topWinner.adText)}*`);
  }

  report.push(`- 📦 **Creative Strategy:** Đối thủ tập trung mạnh vào ${ads.length} bài quảng cáo. Tỷ lệ bài video là ${Math.round(ads.filter(a => a.videoUrl).length / ads.length * 100)}%.`);
  report.push(`- 🎯 **Targeting Insight:** Dựa trên dư địa Winner, sếp nên scale ngân sách vào tệp tương tự đối thủ.`);

  return report.join("\n");
}

function extractHookForRec(text: string): string {
  if (!text) return "N/A";
  const lines = text.split('\n').filter(l => l.trim().length > 5);
  return lines[0] ? `"${lines[0].substring(0, 60)}..."` : "N/A";
}
