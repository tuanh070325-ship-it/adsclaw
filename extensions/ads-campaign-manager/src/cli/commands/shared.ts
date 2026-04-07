import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { loadAssistantContext } from "../../assistant/index.js";
import type { AdsManagerPluginConfig } from "../../core/types.js";

export function suggestFollowUp(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("ngân sách") || normalized.includes("budget")) {
    return "Gợi ý: mở /ngansach để rà soát nhịp chi và lệnh scale.";
  }
  if (normalized.includes("đối thủ") || normalized.includes("competitor")) {
    return "Gợi ý: mở /doithu để xem note đối thủ mới nhất.";
  }
  if (normalized.includes("chiến dịch") || normalized.includes("campaign")) {
    return "Gợi ý: mở /de_xuat để xem action nên duyệt trước.";
  }
  return "Gợi ý: mở /baocao để xem toàn cảnh trước khi ra lệnh tiếp theo.";
}

export function buildLenhUsage(): string {
  return [
    "Dùng:",
    "/lenh <nội dung chỉ đạo từ sếp>",
    "/lenh status",
    "/lenh ack <instruction_id|latest>",
  ].join("\n");
}

export function findLatestQueuedInstructionId(
  context: Awaited<ReturnType<typeof loadAssistantContext>>,
): string | undefined {
  return context.state.instructions.find((instruction) => instruction.status === "queued")?.id;
}

export async function getBusinessId(pluginConfig: AdsManagerPluginConfig) {
  return Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
}

// ─── Phase 19: Shared Circuit Breaker State ──────────────────────────────
export const apifyCircuit = {
  broken: false,
  brokenAt: 0,
  errorCount: 0,
};
export const CIRCUIT_BREAK_THRESHOLD = 3;
export const CIRCUIT_BREAK_DURATION_MS = 60 * 1000; // Testing: 1 minute

export function checkAndResetCircuit(logger: any) {
  if (apifyCircuit.broken && Date.now() - apifyCircuit.brokenAt > CIRCUIT_BREAK_DURATION_MS) {
    apifyCircuit.broken = false;
    apifyCircuit.errorCount = 0;
    logger.info("[Phase19] Apify circuit breaker reset after cooldown.");
  }
}

export function recordApifyError(logger: any) {
  apifyCircuit.errorCount++;
  if (apifyCircuit.errorCount >= CIRCUIT_BREAK_THRESHOLD) {
    apifyCircuit.broken = true;
    apifyCircuit.brokenAt = Date.now();
    logger.warn(`[Phase19] Apify circuit breaker OPENED after ${apifyCircuit.errorCount} errors.`);
  }
}
