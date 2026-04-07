import type {
  AssistantContext,
  CommandReply,
  TelegramButtons,
  ScoredCompetitorAd,
} from "../core/types.js";
import { buildDashboardButtons } from "./buttons.js";
import { healthLabel } from "./helpers.js";

function withButtons(text: string, buttons?: TelegramButtons): CommandReply {
  return buttons
    ? {
        text,
        channelData: {
          telegram: {
            buttons,
          },
        },
      }
    : { text };
}

function scoreLabelEmoji(label: ScoredCompetitorAd["scoreLabel"]): string {
  if (label === "excellent") return "🔥 XUẤT SẮC";
  if (label === "good") return "✅ TỐT";
  if (label === "average") return "🟡 TB";
  return "⚪ BỎ QUA";
}

function engagementSourceTag(source: ScoredCompetitorAd["engagement"]["source"]): string {
  return source === "apify" ? "📊 Dữ liệu thật" : "📐 Ước tính";
}

export function renderTopCompetitorAds(params: {
  keyword: string;
  totalScanned: number;
  qualifiedCount: number;
  topAds: ScoredCompetitorAd[];
  context: AssistantContext;
}): CommandReply {
  const { keyword, totalScanned, qualifiedCount, topAds } = params;

  const lines: string[] = [
    `🔍 TOP BÀI QUẢNG CÁO ĐÁNG HỌC — "${keyword}"`,
    `Phân tích: ${totalScanned} bài | Đạt chuẩn (≥60đ): ${qualifiedCount} bài`,
  ];

  if (topAds.length === 0) {
    lines.push("", "⚪ Không tìm thấy bài nào đạt tiêu chí chất lượng.");
    lines.push("Thử tìm với từ khóa khác hoặc mở rộng ngành hàng.");
    return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
  }

  topAds.slice(0, 5).forEach((ad, idx) => {
    const flags = ad.analysisFlags;
    const breakdown = ad.scoreBreakdown;
    const hookIcon = flags.hookType === "number" ? "🔢" :
                     flags.hookType === "question" ? "❓" :
                     flags.hookType === "painpoint" ? "😟" : "📝";
    const preview = ad.adText.slice(0, 60).replace(/\n/g, " ").trim();

    lines.push("");
    lines.push(`${"━".repeat(22)}`);
    lines.push(`${scoreLabelEmoji(ad.scoreLabel)} #${idx + 1} (${ad.trustScore}/100)`);
    lines.push(`Page: ${ad.pageName}`);
    lines.push(`"${preview}${ad.adText.length > 60 ? "…" : ""}"`);
    lines.push(
      `${ad.engagement.likes}❤️  ${ad.engagement.comments}💬  ${ad.engagement.shares}🔁  |  ` +
      `${ad.daysLive}ngày  |  ${ad.platforms.join("+")}`,
    );
    lines.push(
      `${hookIcon} Hook: ${flags.hookType} ` +
      `${flags.hasCTA ? "✅CTA" : "❌CTA"} ` +
      `${flags.hasSocialProof ? "✅Proof" : "❌Proof"} ` +
      `${flags.hasPrice ? "✅Giá" : "❌Giá"}`,
    );
    if (flags.suspectedFakeEngagement) {
      lines.push("⚠️ Cảnh báo: Tỷ lệ comment thấp, nghi ngờ boost like.");
    }
    lines.push(`📈 Điểm: Xã hội ${breakdown.socialSignals} | Bền vững ${breakdown.longevitySignals} | Creative ${breakdown.creativeQuality}`);
    lines.push(`${engagementSourceTag(ad.engagement.source)}`);
    lines.push(`👉 ${ad.adLibraryUrl}`);
  });

  // Best hook suggestion
  const bestAd = topAds[0];
  if (bestAd) {
    lines.push("");
    lines.push(`💡 Gợi ý: Học hook #1 — dùng "${bestAd.analysisFlags.hookType}" + ${bestAd.daysLive} ngày chứng minh hiệu quả.`);
  }

  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderKnowledgeList(params: {
  docs: any[];
  context: AssistantContext;
}): CommandReply {
  const lines = [
    "📚 **TÀI LIỆU CHIẾN THUẬT RIÊNG CỦA SẾP**",
    "",
    params.docs.length === 0 
      ? "Dạ Sếp ơi, hiện em chưa có bộ nhớ tài liệu nào của Sếp ạ. Sếp hãy gửi file kèm lệnh /themngucanhfile để em học nhé!"
      : `Em đang lưu trí tuệ từ **${params.docs.length}** tài liệu chuyên biệt:`,
  ];

  params.docs.forEach((doc, idx) => {
    const statusIcon = doc.processingStatus === "done" ? "✅" : doc.processingStatus === "failed" ? "❌" : "⏳";
    const sizeKb = Math.ceil((doc.rawSizeBytes || 0) / 1024);
    const modelIcon = doc.processingModel === "mistral" ? "🌪️ Mistral AI" : "💻 Local AI";
    
    lines.push("");
    lines.push(`${statusIcon} **#${idx + 1}: ${doc.filename}**`);
    lines.push(`   • ID: \`${doc.id}\` | Type: \`${String(doc.fileType).toUpperCase()}\` | Size: \`${sizeKb} KB\``);
    lines.push(`   • Engine: ${modelIcon}`);
    if (doc.summary) {
      lines.push(`   📌 **Tóm tắt ngắn:** ${doc.summary.slice(0, 150)}${doc.summary.length > 150 ? "..." : ""}`);
    } else if (doc.extractedText) {
      lines.push(`   📌 **Nội dung trích:** ${doc.extractedText.slice(0, 150).replace(/\n/g, " ")}...`);
    }
  });

  if (params.docs.length > 0) {
    lines.push("", "──────────────────");
    lines.push("💡 **Mẹo:** Sếp muốn xóa tài liệu nào thì dùng `/xoangucanh id` ạ.");
  }

  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderKnowledgeAdded(params: {
  doc: any;
  context: AssistantContext;
}): CommandReply {
  const sizeKb = Math.ceil((params.doc.rawSizeBytes || 0) / 1024);
  const modelStr = params.doc.processingModel === "mistral" ? "Mistral Large (Cloud)" : "Local Processor";
  
  const lines = [
    "🚀 **ĐÃ KẾT NẠP KIẾN THỨC MỚI**",
    "",
    `Em đã nạp xong file: *${params.doc.filename}*`,
    `• Dung lượng: \`${sizeKb} KB\``,
    `• Công nghệ: \`${modelStr}\``,
    `• ID: \`${params.doc.id}\``,
    "",
    "📌 **Bản tóm lược dành cho Sếp:**",
    params.doc.summary || "Em đã bóc tách dữ liệu và sẵn sàng trả lời mọi câu hỏi về file này của Sếp! 🧐",
    "",
    "Sếp hãy đặt câu hỏi liên quan đến tài liệu này bất cứ lúc nào, em luôn sẵn sàng hỗ trợ! 🫡",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderEnterpriseHealth(context: AssistantContext): CommandReply {
  const accounts = context.operations.accounts || [];
  const lines = [
    "🩺 **GIÁM SÁT TÀI KHOẢN CÔNG NGHIỆP**",
    `Tổng tài khoản: **${accounts.length}**`,
    "──────────────────",
  ];

  if (accounts.length === 0) {
    lines.push("Hiện chưa có quy trình đăng ký tài khoản nào.");
  } else {
    accounts.forEach((acc, idx) => {
      const total = acc.success_count + acc.fail_count;
      const successRate = total > 0 
        ? (acc.success_count / total * 100).toFixed(1) 
        : "N/A";
      const statusIcon = acc.fail_count > 5 ? "🔴" : acc.fail_count > 0 ? "🟡" : "🟢";
      const proxyMask = acc.proxy_url ? (acc.proxy_url.length > 20 ? acc.proxy_url.slice(0, 20) + "..." : acc.proxy_url) : "N/A";
      
      lines.push(`${statusIcon} **#${idx + 1}: ${acc.fb_email}**`);
      lines.push(`   • Thành công: ${acc.success_count} | Thất bại: ${acc.fail_count} | SR: ${successRate}%`);
      lines.push(`   • Proxy: \`${proxyMask}\``);
      if (acc.last_error) {
        lines.push(`   • Lỗi: ${acc.last_error.slice(0, 60)}${acc.last_error.length > 60 ? "..." : ""}`);
      }
      lines.push("");
    });
  }

  lines.push("💡 **Enterprise Mode:** Tự động điều phối qua Worker Pool & Proxy Rotation.");
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}
