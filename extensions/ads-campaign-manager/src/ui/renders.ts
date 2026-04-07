import type {
  AssistantContext,
  CommandReply,
  DerivedProposal,
  TelegramButtons,
} from "../core/types.js";
import { 
  healthLabel, formatDate, formatMoney, formatRoas, formatPercent, 
  summarizeCampaign, operationsBlock, warningBlock, safeModeBlock,
  severityEmoji, proposalEmoji, statusEmoji
} from "./helpers.js";
import { 
  buildDashboardButtons, buildProposalButtons 
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

export function renderReport(context: AssistantContext): CommandReply {
  const topRisk = context.derived.atRisk[0];
  const topWinner = context.derived.winners[0];
  const lines = [
    `🏢 **${context.config.business.name.toUpperCase()}**`,
    `👤 Sếp: ${context.config.business.ownerName}`,
    `--------------------------------`,
    `📊 TRẠNG THÁI: ${healthLabel(context.derived.health)}`,
    `⏰ Cập nhật: ${formatDate(context.derived.generatedAt, context)}`,
    "",
    `💰 **NGÂN SÁCH HÔM NAY:**`,
    `• Đã chi: ${formatMoney(context.derived.budget.spendToday, context)}`,
    `• Hạn mức: ${formatMoney(context.derived.budget.budgetToday, context)}`,
    `• Hiệu suất sử dụng: **${(context.derived.budget.utilization * 100).toFixed(1)}%**`,
    "",
    `🔔 **THÔNG BÁO QUAN TRỌNG:**`,
    `• Cảnh báo mới: ${context.derived.alerts.length}`,
    `• Đề xuất chờ duyệt: ${context.state.proposals.filter((p) => p.status === "pending").length}`,
  ];

  if (topRisk) {
    lines.push("", "Rủi ro nổi bật:", summarizeCampaign(topRisk, context));
  }
  if (topWinner) {
    lines.push("", "Điểm sáng nổi bật:", summarizeCampaign(topWinner, context));
  }
  lines.push("", "Việc hôm nay:", ...context.derived.dailyTasks.map((task) => `- ${task}`));

  const buttons = buildDashboardButtons(context);
  const proposalButtons = buildProposalButtons(context);
  const mergedButtons = proposalButtons ? [...(buttons ?? []), ...proposalButtons] : buttons;
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  lines.push("", "💡 Gợi ý bước tiếp theo: Sếp nên kiểm tra `/de_xuat` để tối ưu ngân sách hoặc `/doithu` để thám báo đối thủ.");
  return withButtons(lines.join("\n"), mergedButtons);
}

export function renderOverview(context: AssistantContext): CommandReply {
  const lines = [
    `🩺 **TỔNG QUAN TÀI KHOẢN**`,
    `Account: ${context.snapshot?.account?.name ?? context.config.business.name}`,
    `--------------------------------`,
    `Health: ${healthLabel(context.derived.health)}`,
    `🏆 Chiến dịch thắng: ${context.derived.winners.length}`,
    `🧐 Đang theo dõi: ${context.derived.watchlist.length}`,
    `🚨 Đang rủi ro: ${context.derived.atRisk.length}`,
    "",
    "📚 **NGUỒN HỌC CHIẾN THUẬT:**",
    `- Đã kích hoạt: ${context.registrySummary.enabledSources} nguồn`,
    `- Tier 1 (Hàng đầu): ${context.registrySummary.byTier.tier1_official}`,
    `- Tier 2 (Thực chiến): ${context.registrySummary.byTier.tier2_practitioner}`,
    "",
    `🔄 Sync lần cuối: ${formatDate(context.state.lastSyncAt, context)}`,
  ];
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  lines.push("", "💡 Gợi ý: Sếp hãy dùng `/dongbo` để cập nhật số liệu mới nhất.");
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderAlerts(context: AssistantContext): CommandReply {
  const lines = ["🚨 Danh sách cảnh báo hiện tại"];
  if (context.derived.alerts.length === 0) {
    lines.push("Không có cảnh báo nào ở thời điểm này.");
  } else {
    for (const alert of context.derived.alerts) {
      lines.push("", `${severityEmoji(alert.severity)} ${alert.title}`, alert.summary);
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderBudget(context: AssistantContext): CommandReply {
  const budget = context.derived.budget;
  const pendingScale = context.state.proposals.filter((proposal) =>
    proposal.id.startsWith("tangngansach_"),
  );
  const lines = [
    "💸 Bảng điều phối ngân sách",
    `Đã chi hôm nay: ${formatMoney(budget.spendToday, context)}`,
    `Budget ngày: ${formatMoney(budget.budgetToday, context)}`,
    `Tỷ lệ sử dụng: ${(budget.utilization * 100).toFixed(1)}%`,
    `Overspend: ${budget.overspending ? "Có" : "Không"}`,
    "",
    `Đề xuất scale đang chờ: ${pendingScale.length}`,
  ];
  if (context.derived.winners.length > 0) {
    lines.push("", "Nhóm có thể scale:");
    for (const winner of context.derived.winners.slice(0, 3)) {
      lines.push(
        `- ${winner.campaign.name}: ROAS ${formatRoas(winner.campaign.roas)} | CTR ${formatPercent(winner.campaign.ctr)}`,
      );
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderPlan(context: AssistantContext): CommandReply {
  const queuedInstructions = context.state.instructions.filter(
    (instruction) => instruction.status === "queued",
  );
  const lines = [
    "🗓️ Kế hoạch hành động hôm nay",
    ...context.derived.dailyTasks.map((task, index) => `${index + 1}. ${task}`),
  ];
  if (queuedInstructions.length > 0) {
    lines.push("", "Lệnh đang chờ xử lý:");
    for (const instruction of queuedInstructions.slice(0, 3)) {
      lines.push(`- ${instruction.id}: ${instruction.text}`);
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderProposals(context: AssistantContext): CommandReply {
  const lines = ["🧠 Danh sách đề xuất tối ưu"];
  if (context.state.proposals.length === 0) {
    lines.push("Hiện chưa có đề xuất nào.");
  } else {
    for (const proposal of context.state.proposals.slice(0, 8)) {
      lines.push(
        "",
        `${proposalEmoji(proposal.impact)} ${statusEmoji(proposal.status)} ${proposal.title}`,
        `ID: ${proposal.id}`,
        proposal.summary,
        `Lý do: ${proposal.reason}`,
      );
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(
    lines.join("\n"),
    buildProposalButtons(context) ?? buildDashboardButtons(context),
  );
}

export function renderCompetitors(context: AssistantContext): CommandReply {
  const competitors = context.snapshot?.competitors ?? [];
  const lines = ["🕵️ Góc nhìn đối thủ"];
  if (competitors.length === 0) {
    lines.push("Chưa có dữ liệu đối thủ trong snapshot.");
  } else {
    for (const competitor of competitors.slice(0, 5)) {
      lines.push(
        "",
        `${competitor.name}${competitor.region ? ` | ${competitor.region}` : ""}`,
        competitor.angle ? `Angle: ${competitor.angle}` : "Angle: n/a",
        competitor.note ? `Note: ${competitor.note}` : "Note: n/a",
      );
    }
  }
  lines.push(
    "",
    "Lưu ý:",
    "- Dữ liệu đối thủ chỉ dùng để gợi ý creative/offer, không suy ra hiệu quả thật.",
  );
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderSyncResult(context: AssistantContext): CommandReply {
  const lines = [
    "🔄 Đồng bộ hoàn tất",
    `Thời gian: ${formatDate(context.state.lastSyncAt, context)}`,
    `Campaign đọc được: ${context.snapshot?.campaigns.length ?? 0}`,
    `Cảnh báo: ${context.derived.alerts.length}`,
    `Đề xuất: ${context.state.proposals.length}`,
  ];
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderApprovalResult(params: {
  context: AssistantContext;
  proposal: DerivedProposal;
  action: "approved" | "rejected";
}): CommandReply {
  const verb = params.action === "approved" ? "đã duyệt" : "đã từ chối";
  const lines = [
    `${params.action === "approved" ? "✅" : "⛔"} Đề xuất ${verb}`,
    `${params.proposal.title}`,
    `ID: ${params.proposal.id}`,
    params.proposal.summary,
  ];
  lines.push(...operationsBlock(params.context));
  lines.push(...warningBlock(params.context));
  lines.push(...safeModeBlock(params.context));
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderInstructionAck(params: {
  context: AssistantContext;
  instruction: { id: string; text: string };
}): CommandReply {
  const lines = [
    "🫡 Đã nhận lệnh từ sếp",
    `ID: ${params.instruction.id}`,
    params.instruction.text,
    "",
    "Gợi ý bước tiếp theo:",
    "- /kehoach để xem việc hôm nay",
    "- /de_xuat để xem các action chờ duyệt",
    "- /lenh status để xem hàng đợi lệnh",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderInstructionStatus(context: AssistantContext): CommandReply {
  const queued = context.state.instructions.filter(
    (instruction) => instruction.status === "queued",
  );
  const acknowledged = context.state.instructions.filter(
    (instruction) => instruction.status === "acknowledged",
  );
  const lines = [
    "📥 Hàng đợi lệnh từ sếp",
    `Queued: ${queued.length}`,
    `Acknowledged: ${acknowledged.length}`,
  ];
  if (queued.length === 0) {
    lines.push("", "Không có lệnh nào đang chờ xử lý.");
  } else {
    lines.push("", "Lệnh đang chờ:");
    for (const instruction of queued.slice(0, 5)) {
      lines.push(`- ${instruction.id}: ${instruction.text}`);
    }
  }
  lines.push("", "Mẹo:", "- /lenh ack latest", "- /lenh ack <instruction_id>");
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderInstructionCompletion(params: {
  context: AssistantContext;
  instruction: { id: string; text: string };
}): CommandReply {
  const lines = [
    "✅ Đã đánh dấu hoàn tất lệnh",
    `ID: ${params.instruction.id}`,
    `Lệnh: ${params.instruction.text}`,
    "",
    "Bạn có thể dùng /lenh status để kiểm tra queue còn lại.",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}
