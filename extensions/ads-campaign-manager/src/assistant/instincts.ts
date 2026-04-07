import { BotInstinct, AdsManagerPluginConfig } from "../core/types.js";
import { saveBotInstinct } from "../core/db-state.js";
import crypto from "node:crypto";

/**
 * ECC-inspired Instincts: 
 * Tự động trích xuất thói quen làm việc từ phiên chat của Sếp.
 */
export async function createInstinct(
  config: AdsManagerPluginConfig, 
  triggerRegex: string, 
  rule: string, 
  confidence: number = 0.9
): Promise<BotInstinct> {
  const instinct: BotInstinct = {
    id: crypto.randomUUID(),
    businessId: "", // Will be filled by saveBotInstinct using ensureBusinessConfig
    triggerRegex,
    instinctRule: rule,
    confidence,
    createdAt: new Date().toISOString()
  };

  await saveBotInstinct(config, instinct);
  return instinct;
}

/**
 * Format instincts for the System Prompt header.
 */
export function formatInstinctsForPrompt(instincts: BotInstinct[]): string {
  if (!instincts || instincts.length === 0) return "";

  let output = "\n### ECC INSTINCTS (BẢN NĂNG HÀNH XỬ ĐÃ HỌC)\n";
  output += "Dưới đây là các thói quen và luật ưu tiên sếp đã dạy bạn trong các phiên trước:\n";
  
  instincts.forEach((ins, idx) => {
    output += `${idx + 1}. [Khi khớp: ${ins.triggerRegex}] -> Thực thi: ${ins.instinctRule}\n`;
  });
  
  return output;
}

/**
 * Phân tích nội dung chat để tự đề xuất bản năng (Continuous Learning).
 * Ở bản này, ta detect các mẫu câu sếp ra lệnh mang tính "Luật" như "Từ nay luôn...", "Nhớ là...".
 */
export async function autoEvolveInstincts(config: AdsManagerPluginConfig, lastUserMessage: string): Promise<boolean> {
  const patterns = [
    { regex: /từ nay luôn (.*)/i, label: "Luật cố định" },
    { regex: /nhớ là (.*)/i, label: "Lưu ý quan trọng" },
    { regex: /ưu tiên (.*)/i, label: "Quy tắc ưu tiên" }
  ];

  for (const p of patterns) {
    const match = lastUserMessage.match(p.regex);
    if (match && match[1]) {
      await createInstinct(config, p.regex.source, match[1].trim());
      return true;
    }
  }

  return false;
}
