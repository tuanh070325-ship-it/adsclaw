import { AssistantContext, BotInstinct, AdsManagerPluginConfig } from "../core/types.js";
import { formatInstinctsForPrompt } from "./instincts.js";
import { getStrategicMemory } from "../core/db-state.js";

/**
 * ECC Hook System: Pre-Action & Post-Action guards.
 */

export interface HookResult {
  modifiedContext?: AssistantContext;
  abort?: boolean;
  reason?: string;
  shieldAlert?: string;
}

/**
 * Pre-Tool Hook: Thường dùng để nạp Instincts và Memory vào bối cảnh.
 */
export async function runPreToolHooks(
  config: AdsManagerPluginConfig,
  context: AssistantContext
): Promise<HookResult> {
  // 1. Nạp Instincts vào bối cảnh (Context Memory)
  if (context.state.instincts && context.state.instincts.length > 0) {
    const instinctContext = formatInstinctsForPrompt(context.state.instincts);
    // Ta chèn vào phần đầu của warnings hoặc một field context mới để LLM thấy
    context.warnings.unshift(`[ECC_INSTINCT_ACTIVE]: Hệ thống đang áp dụng ${context.state.instincts.length} bản năng đã học.`);
  }

  // 1.1 Nạp Strategic Memory (Bài học chiến thuật)
  const memories = await getStrategicMemory(config);
  if (memories && memories.length > 0) {
    const memoryContext = memories.map(m => `[${m.category.toUpperCase()}] ${m.insight} (Confidence: ${m.confidenceScore})`).join("\n");
    context.warnings.push(`[ECC_STRATEGIC_MEMORY]: Sếp đã dạy ${memories.length} bài học chiến thuật gần đây:\n${memoryContext}`);
  }

  // 2. Kiểm tra an toàn ngân sách (Budget Shield)
  const isHighRisk = context.derived.budget.overspending && !config.safeMode;
  if (isHighRisk) {
    return {
      abort: false, // Không abort nhưng thêm cảnh báo cực cao
      reason: "⚠️ CẢNH BÁO: Ngân sách đang vượt ngưỡng, mọi thay đổi tăng chi phí sẽ bị giám sát chặt."
    };
  }

  return { modifiedContext: context };
}

/**
 * Post-Tool Hook: ECC AgentShield - Dò quét rò rỉ dữ liệu nhạy cảm.
 */
export async function runPostToolHooks(
  config: AdsManagerPluginConfig,
  output: any
): Promise<HookResult> {
  const outputStr = JSON.stringify(output);
  
  // AgentShield: Chặn leak Meta Access Token trong log/output
  const tokenRegex = /EAAG[a-zA-Z0-9]+|mgmt_[a-zA-Z0-9]+/g;
  if (tokenRegex.test(outputStr)) {
    return {
      shieldAlert: "🚨 AgentShield Alert: Phát hiện rò rỉ Access Token trong dữ liệu đầu ra! Đã tự động ẩn thông tin nhạy cảm.",
      abort: true,
      reason: "Security Breach Prevention"
    };
  }

  return { abort: false };
}

/**
 * ECC Persistent Session: Tóm tắt phiên làm việc khi kết thúc.
 */
export function summarizeSessionEnd(context: AssistantContext): string {
  const stats = context.derived.budget;
  const proposalCount = context.state.proposals.filter(p => p.status === "pending").length;
  
  return `[SESSION_END]
- Trạng thái: ${context.derived.health.toUpperCase()}
- Ngân sách: ${stats.spendToday.toLocaleString()} / ${stats.budgetToday.toLocaleString()}
- Đề xuất chờ duyệt: ${proposalCount}
- Bản năng mới: ${context.state.instincts?.length || 0}
`;
}
