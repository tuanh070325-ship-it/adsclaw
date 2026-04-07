import type {
  AssistantContext,
  TelegramButtons,
} from "../core/types.js";
import { fitsCallbackData } from "./helpers.js";

export function buildDashboardButtons(context: AssistantContext): TelegramButtons | undefined {
  if (!context.config.telegram.showDashboardButtons) {
    return undefined;
  }

  const candidates: TelegramButtons = [
    [
      { text: "📊 Báo cáo", callback_data: "/baocao" },
      { text: "🩺 Tổng quan", callback_data: "/tongquan" },
    ],
    [
      { text: "🚨 Cảnh báo", callback_data: "/canhbao" },
      { text: "💸 Ngân sách", callback_data: "/ngansach" },
    ],
    [
      { text: "🗓️ Kế hoạch", callback_data: "/kehoach" },
      { text: "🧠 Đề xuất", callback_data: "/de_xuat" },
    ],
    [
      { text: "🕵️ Đối thủ", callback_data: "/doithu" },
      { text: "🫡 Lệnh", callback_data: "/lenh status" },
    ],
    [{ text: "🔄 Đồng bộ", callback_data: "/dongbo" }],
  ];

  const rows = candidates
    .map((row) => row.filter((button) => fitsCallbackData(button.callback_data)))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? rows : undefined;
}

export function buildWelcomeButtons(_context: AssistantContext): TelegramButtons {
  return [
    [
      { text: "📊 Xem Ads", callback_data: "/baocao" },
      { text: "🕵️ Soi Đối thủ", callback_data: "/doithu" },
    ],
    [
      { text: "📖 Hướng dẫn", callback_data: "/huong_dan" },
      { text: "⚙️ Cài đặt", callback_data: "/cau_hinh" },
    ],
    [{ text: "🔥 Khám phá tính năng nâng cao →", callback_data: "/kham_pha" }],
  ];
}

export function buildDiscoveryButtons(_context: AssistantContext): TelegramButtons {
  return [
    [
      { text: "🚀 Kiểm soát", callback_data: "/menu_kiemsoan" },
      { text: "🕵️ Chiến thuật", callback_data: "/menu_chienthuat" },
    ],
    [
      { text: "🫡 Ra lệnh AI", callback_data: "/menu_ralenh" },
      { text: "📘 Quản lý Page", callback_data: "/menu_page" },
    ],
    [{ text: "✅ Kiểm tra hệ thống", callback_data: "/kiem_tra" }],
  ];
}

export function buildSubMenuKiemSoanButtons(): TelegramButtons {
  return [
    [
      { text: "📊 Báo cáo hôm nay", callback_data: "/baocao" },
      { text: "🩺 Sức khỏe ADS", callback_data: "/tongquan" },
    ],
    [
      { text: "🚨 Cảnh báo", callback_data: "/canhbao" },
      { text: "🩺 Sức khỏe", callback_data: "/accounts" },
    ],
    [{ text: "⬅️ Quay lại Menu", callback_data: "/huong_dan" }],
  ];
}

export function buildSubMenuChienThuatButtons(): TelegramButtons {
  return [
    [
      { text: "🕵️ Soi đối thủ", callback_data: "/doithu" },
      { text: "🗓️ Kế hoạch", callback_data: "/kehoach" },
    ],
    [
      { text: "🧠 Đề xuất AI", callback_data: "/de_xuat" },
      { text: "🔄 Đồng bộ", callback_data: "/dongbo" },
    ],
    [{ text: "⬅️ Quay lại Menu", callback_data: "/huong_dan" }],
  ];
}

export function buildSubMenuRaLenhButtons(): TelegramButtons {
  return [
    [
      { text: "🫡 Ra lệnh", callback_data: "/lenh status" },
      { text: "✅ Phê duyệt", callback_data: "/de_xuat" },
    ],
    [{ text: "⬅️ Quay lại Menu", callback_data: "/huong_dan" }],
  ];
}

export function buildSubMenuPageButtons(): TelegramButtons {
  return [
    [
      { text: "📝 Đăng bài", callback_data: "/dang_bai" },
      { text: "🖼️ Đăng ảnh", callback_data: "/up_anh" },
    ],
    [
      { text: "📥 Inbox", callback_data: "/inbox" },
      { text: "💬 Comments", callback_data: "/comments" },
    ],
    [
      { text: "🗓️ Đặt lịch", callback_data: "/dat_lich" },
      { text: "📝 Bài viết", callback_data: "/bai_viet" },
    ],
    [
      { text: "📊 Thống kê bài", callback_data: "/thongke" },
      { text: "🚀 Forward", callback_data: "/inbox_forward status" },
    ],
    [{ text: "⬅️ Quay lại", callback_data: "/huong_dan" }],
  ];
}

export function buildMainMenuButtons(context: AssistantContext): TelegramButtons | undefined {
  const candidates: TelegramButtons = [
    [
      { text: "📖 Hướng dẫn", callback_data: "/huong_dan" },
      { text: "⚙️ Cấu hình", callback_data: "/cau_hinh" },
    ],
    [
      { text: "✅ Kiểm tra", callback_data: "/kiem_tra" },
      { text: "📜 Nội quy", callback_data: "/noi_quy" },
    ],
    [{ text: "🏠 Trang chủ (Báo cáo)", callback_data: "/baocao" }],
  ];

  const rows = candidates
    .map((row) => row.filter((button) => fitsCallbackData(button.callback_data)))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? rows : undefined;
}

export function buildProposalButtons(context: AssistantContext): TelegramButtons | undefined {
  const pending = context.state.proposals
    .filter((proposal) => proposal.status === "pending")
    .slice(0, context.config.telegram.maxProposalButtons);

  if (pending.length === 0) {
    return undefined;
  }

  const rows: TelegramButtons = [];
  for (const proposal of pending) {
    const approve = `/pheduyet ${proposal.id}`;
    const reject = `/tuchoi ${proposal.id}`;
    if (!fitsCallbackData(approve) || !fitsCallbackData(reject)) {
      continue;
    }
    rows.push([
      { text: `✅ ${proposal.id}`, callback_data: approve },
      { text: `⛔ ${proposal.id}`, callback_data: reject },
    ]);
  }
  return rows.length > 0 ? rows : undefined;
}
