import type {
  AssistantContext,
  DerivedAlert,
  DerivedCampaignView,
  DerivedProposal,
} from "../core/types.js";

const TELEGRAM_CALLBACK_LIMIT_BYTES = 64;

export function fitsCallbackData(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= TELEGRAM_CALLBACK_LIMIT_BYTES;
}

export function localeCode(locale: "vi" | "en"): string {
  return locale === "en" ? "en-US" : "vi-VN";
}

export function formatMoney(value: number, context: AssistantContext): string {
  return new Intl.NumberFormat(localeCode(context.config.locale), {
    style: "currency",
    currency: context.config.business.currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

export function formatRoas(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "n/a";
  }
  return `${value.toFixed(2)}x`;
}

export function formatDate(value: string | undefined, context: AssistantContext): string {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(localeCode(context.config.locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.config.business.timezone,
  }).format(date);
}

export function healthLabel(level: AssistantContext["derived"]["health"]): string {
  if (level === "good") {
    return "🟢 ỔN ĐỊNH";
  }
  if (level === "watch") {
    return "🟡 CẦN THEO DÕI";
  }
  return "🔴 RỦI RO";
}

export function severityEmoji(severity: DerivedAlert["severity"]): string {
  if (severity === "high") {
    return "🔴";
  }
  if (severity === "medium") {
    return "🟠";
  }
  return "🟡";
}

export function proposalEmoji(impact: DerivedProposal["impact"]): string {
  if (impact === "high") {
    return "🚀";
  }
  if (impact === "medium") {
    return "🧠";
  }
  return "📝";
}

export function statusEmoji(status: DerivedProposal["status"]): string {
  if (status === "approved") {
    return "✅";
  }
  if (status === "rejected") {
    return "⛔";
  }
  return "⏳";
}

export function summarizeCampaign(view: DerivedCampaignView, context: AssistantContext): string {
  const spend = formatMoney(view.campaign.spendToday ?? 0, context);
  return [
    `${view.campaign.name}`,
    `ROAS ${formatRoas(view.campaign.roas)} | CTR ${formatPercent(view.campaign.ctr)} | CPA ${formatMoney(view.campaign.cpa ?? 0, context)} | Spend ${spend}`,
    view.reasons[0] ?? "No extra notes.",
  ].join("\n");
}

export function warningBlock(context: AssistantContext): string[] {
  if (context.warnings.length === 0) {
    return [];
  }
  return ["", "Cảnh báo hệ thống:", ...context.warnings.map((warning) => `- ${warning}`)];
}

export function operationsBlock(context: AssistantContext): string[] {
  const lines = [
    "",
    `Data source: ${context.operations.dataSource}`,
    `Live writes: ${context.operations.liveWritesEnabled ? "on" : "off"}`,
  ];
  if (context.operations.webhookPath) {
    lines.push(`Meta webhook: ${context.operations.webhookPath}`);
  }
  if (context.operations.lastWebhookEventAt) {
    lines.push(
      `Webhook events: ${context.operations.recentWebhookEvents} | Last: ${formatDate(context.operations.lastWebhookEventAt, context)}`,
    );
  }
  return lines;
}

export function safeModeBlock(context: AssistantContext): string[] {
  if (!context.config.safeMode) {
    return [];
  }
  return [
    "",
    "Safe mode:",
    "- Phê duyệt hiện chỉ cập nhật state nội bộ của trợ lý.",
    "- Chưa có thay đổi nào được đẩy sang nền tảng ads thật ở plugin này.",
  ];
}
