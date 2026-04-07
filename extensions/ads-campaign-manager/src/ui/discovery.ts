import type {
  AssistantContext,
  CommandReply,
  TelegramButtons,
} from "../core/types.js";
import { healthLabel } from "./helpers.js";
import { 
  buildWelcomeButtons, buildDiscoveryButtons, buildSubMenuKiemSoanButtons, 
  buildSubMenuChienThuatButtons, buildSubMenuRaLenhButtons, buildSubMenuPageButtons,
  buildMainMenuButtons
} from "./buttons.js";

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

export function renderWelcome(context: AssistantContext): CommandReply {
  const ownerName = context.config.business.ownerName ?? "Sếp";
  const health = context.derived.health;
  const pending = context.state.proposals.filter((p) => p.status === "pending").length;
  const lines = [
    `🤖 Chào **${ownerName}**! Tôi là Trợ lý Ads AI của Sếp.`,
    "",
    `📊 Tình trạng tài khoản: ${healthLabel(health)}`,
    pending > 0
      ? `⏳ Đề xuất chờ duyệt: **${pending}** (dùng /de_xuat để xem)`
      : "✅ Không có việc tồn đọng.",
    "",
    "Chọn việc Sếp muốn làm ngay bây giờ:",
  ];
  return withButtons(lines.join("\n"), buildWelcomeButtons(context));
}

export function renderGuide(context: AssistantContext): CommandReply {
  const lines = [
    "📖 TRUNG TÂM ĐIỀU KHIỂN",
    "Chọn nhóm tính năng Sếp cần:",
    "",
    "🚀 Kiểm soát → Báo cáo, KPI, Cảnh báo",
    "🕵️ Chiến thuật → Đối thủ, Đề xuất AI",
    "🫡 Ra lệnh AI → Duyệt phương án, Điều phối",
    "📘 Quản lý Page → Đăng bài, Inbox, Thống kê",
    "",
    "💡 Mẹo: Bấm vào nhóm bên dưới để xem lệnh chi tiết!",
  ];
  return withButtons(lines.join("\n"), buildDiscoveryButtons(context));
}

export function renderSubMenuKiemSoan(_context: AssistantContext): CommandReply {
  const lines = [
    "🚀 NHÓM: KIỂM SOÁT & BIẾN ĐỘNG",
    "Công cụ theo dõi hiệu suất Ads:",
    "",
    "📊 /baocao — Toàn cảnh chiến dịch & ROI hôm nay",
    "🩺 /tongquan — Sức khỏe tổng thể tài khoản",
    "🚨 /canhbao — Các cảnh báo bất thường cần xử lý",
    "💸 /ngansach — Nhịp chi tiêu và pacing ngân sách",
  ];
  return withButtons(lines.join("\n"), buildSubMenuKiemSoanButtons());
}

export function renderSubMenuChienThuat(_context: AssistantContext): CommandReply {
  const lines = [
    "🕵️ NHÓM: CHIẾN THUẬT & THÁM PHÂN",
    "Công cụ nghiên cứu và lập kế hoạch:",
    "",
    "🕵️ /doithu — Soi mẫu quảng cáo đối thủ đang chạy",
    "🗓️ /kehoach — Lập kế hoạch phân tích tuần",
    "🧠 /de_xuat — Xem các phương án AI đề xuất",
    "🔄 /dongbo — Cập nhật số liệu Realtime từ Meta",
  ];
  return withButtons(lines.join("\n"), buildSubMenuChienThuatButtons());
}

export function renderSubMenuRaLenh(context: AssistantContext): CommandReply {
  const pending = context.state.proposals.filter((p) => p.status === "pending").length;
  const lines = [
    "🫡 NHÓM: RA LỆNH & PHÊ DUYỆT",
    `Đề xuất đang chờ: **${pending}**`,
    "",
    "🫡 /lenh <nội dung> — Ra lệnh cho AI",
    "   Ví dụ: /lenh giảm budget camp X xuống 20%",
    "",
    "✅ /pheduyet <ID> — Phê duyệt đề xuất AI",
    "❌ /tuchoi <ID> — Từ chối đề xuất",
    "",
    "💻 /lenh status — Xem hàng đợi lệnh",
  ];
  return withButtons(lines.join("\n"), buildSubMenuRaLenhButtons());
}

export function renderSubMenuPage(context: AssistantContext): CommandReply {
  const pageCfg = context.config.facebookPage;
  const connected = pageCfg?.enabled && (pageCfg?.pageId ?? pageCfg?.pageIdEnvVar);
  const lines = [
    "📘 NHÓM: QUẢN LÝ FANPAGE",
    connected ? "🟢 Đã kết nối Facebook Page" : "🔴 Chưa kết nối — Thêm FB_PAGE_ACCESS_TOKEN vào .env",
    "",
    "📝 /dang_bai <nội dung> — Đăng bài văn bản",
    "🖼️ /up_anh <url> <caption> — Đăng kèm ảnh ảnh",
    "📥 /inbox — 5 tin nhắn inbox mới nhất",
    "🗓️ /dat_lich <time> <text> — Lên lịch bài",
    "📝 /bai_viet — 10 bài đăng gần nhất",
    "❌ /xoa_bai <id> — Xóa bài trên Page",
    "🚀 /inbox_forward start — Bật chuyển tiếp tin",
  ];
  return withButtons(lines.join("\n"), buildSubMenuPageButtons());
}

export function renderKhamPha(context: AssistantContext): CommandReply {
  const lines = [
    "🔥 TÍNH NĂNG NÂNG CAO — PREMIUM",
    "",
    "🤖 AI TỰ ĐỘNG:",
    "  • Phân tích xu hướng 7 ngày (/tongquan)",
    "  • Đề xuất tăng/giảm ngân sách tự động",
    "  • Soi quảng cáo đối thủ real-time",
    "",
    "📊 BÁO CÁO THÔNG MINH:",
    "  • Bảng đèn giao thông 🔴🟡🟢",
    "  • Toàn cảnh Account → Campaign → Ad",
    "  • So sánh hiệu suất ngày/tuần",
    "",
    "📘 QUẢN LÝ FANPAGE (Phase 17):",
    "  • Đăng bài, sửa bài, xem inbox",
    "  • Đọc comment & trả lời từ Telegram",
    "  • Thống kê Like/Share/Comment",
    "",
    "💰 Sếp đang dùng đúng công cụ cạnh tranh hơn cả team đối thủ! 🚀",
  ];
  return withButtons(lines.join("\n"), buildWelcomeButtons(context));
}

export function renderPageSelectionMenu(context: AssistantContext): CommandReply {
  const pages = context.operations.pages ?? [];
  const lines = [
    "📘 **CHỌN PAGE LÀM VIỆC**",
    `Tài khoản: ${context.operations.accounts?.[0]?.fb_email ?? "N/A"}`,
    `Tìm thấy: ${pages.length} Page có quyền đăng bài`,
    "--------------------------------",
  ];

  if (pages.length === 0) {
    lines.push("Hiện chưa tìm thấy Page nào. Sếp vui lòng thử /nhap_token lại hoặc kiểm tra quyền ứng dụng.");
    return withButtons(lines.join("\n"), buildDiscoveryButtons(context));
  }

  const rows: TelegramButtons = [];
  for (const page of pages) {
    const isSelected = page.is_selected || page.id === context.operations.selectedPageId;
    const emoji = isSelected ? "🟢" : "⚪";
    lines.push(`${emoji} **${page.page_name}** (${page.category || "General"})`);
    
    rows.push([{ 
      text: `${isSelected ? "📍 Đang chọn: " : "✅ Chọn: "} ${page.page_name}`, 
      callback_data: `/chon_page ${page.id}` 
    }]);
  }

  lines.push("", "💡 Mẹo: Sau khi chọn Page, các lệnh /dangbai sẽ được thực hiện dưới danh nghĩa Page đó.");
  
  const buttons = [...rows, [{ text: "⬅️ Quay lại", callback_data: "/huong_dan" }]];
  return withButtons(lines.join("\n"), buttons);
}

export function renderConfig(context: AssistantContext): CommandReply {
  const currentAccount = context.operations.accounts?.[0];
  const selectedPage = context.operations.pages?.find(p => p.is_selected || p.id === context.operations.selectedPageId);
  
  const metaStatus = (context.config.meta.accessToken || currentAccount?.access_token) ? "Đã nhập ✅" : "Chưa có ❌";
  const scrapeStatus = process.env.SCRAPECREATORS_API_KEY ? "Đã có ✅" : "Chưa có ❌";
  const apifyStatus = process.env.APIFY_TOKEN ? "Đã có ✅" : "Chưa có ❌";

  const lines = [
    "⚙️ CẤU HÌNH MÔI TRƯỜNG",
    "",
    `- Tên Brand: ${context.config.business.name}`,
    `- Tiền tệ: ${context.config.business.currency}`,
    `- Timezone: ${context.config.business.timezone}`,
    "",
    "🔑 TRẠNG THÁI KEY/TOKEN:",
    `- Meta API: ${metaStatus}`,
    currentAccount ? `- Facebook: ${currentAccount.fb_email} 👤` : "",
    selectedPage ? `- Đang chọn Page: ${selectedPage.page_name} 📘` : "- Chưa chọn Page (Sử dụng cá nhân)",
    `- ScrapeCreators: ${scrapeStatus}`,
    `- Apify Core: ${apifyStatus}`,
    "",
    "💡 Mẹo: Để cập nhật Token, Sếp vui lòng sửa file .env hoặc liên hệ IT admin.",
  ].filter(l => l !== "");
  
  const buttons = buildMainMenuButtons(context) || [];
  buttons.push([{ text: "📘 Chọn Page khác", callback_data: "/page_list" }]);

  return withButtons(lines.join("\n"), buttons);
}

export function renderConfigCheck(context: AssistantContext): CommandReply {
  const lines = [
    "✅ KIỂM TRA HỆ THỐNG (DOCTOR)",
    "",
    "🚀 Trạng thái kết nối:",
    context.config.meta.enabled ? "• Meta API: Sẵn sàng 🟢" : "• Meta API: Đang tắt ⚪",
    context.operations.webhookPath ? "• Webhook: Đã active 🟢" : "• Webhook: Chưa nhận event 🔴",
    context.registrySummary.enabledSources > 0 ? "• Database AI: Sẵn sàng 🟢" : "• Database AI: Trống 🔴",
    "",
    `🤖 Mode hiện tại: ${context.config.syncMode.toUpperCase()}`,
    `🛡️ Safe Mode: ${context.config.safeMode ? "BẬT (Chỉ mô phỏng)" : "TẤT (Ghi dữ liệu thật)"}`,
    "",
    "Everything look good, Sếp!",
  ];
  return withButtons(lines.join("\n"), buildMainMenuButtons(context));
}

export function renderRules(context: AssistantContext): CommandReply {
  const lines = [
    "📜 NỘI QUY & ĐIỀU KHOẢN SỬ DỤNG",
    "",
    "1. Bảo mật: Không chia sẻ link báo cáo hoặc Token Bot cho bên thứ 3.",
    "2. Trách nhiệm: AI đưa ra đề xuất, Sếp là người ra quyết định cuối cùng (/pheduyet).",
    "3. Giới hạn: Tránh ra lệnh dồn dập trong 1 giây để tránh bị Meta khóa API.",
    "4. Dữ liệu: Bot cập nhật dữ liệu định kỳ, hãy dùng /dongbo nếu cần số liệu realtime.",
    "",
    "Chúc Sếp có những chiến dịch triệu đô! 💸",
  ];
  return withButtons(lines.join("\n"), buildMainMenuButtons(context));
}
