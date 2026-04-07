import type { AdsManagerPluginConfig, DerivedProposal, AssistantContext } from "../core/types.js";
import { saveStrategicMemory } from "../core/db-state.js";
import logger from "../core/logger.js";

/**
 * ECC Memory Hook: Tự động phân tích lý do Sếp từ chối hoặc góp ý.
 */
export async function reflectOnUserFeedback(params: {
  config: AdsManagerPluginConfig;
  context: AssistantContext;
  lastUserMessage: string;
  relatedProposal?: DerivedProposal;
}): Promise<void> {
  const { config, context, lastUserMessage, relatedProposal } = params;
  
  // Logic trích xuất âm thầm:
  // Nếu Sếp Reject và có kèm text giải thích, ta trích xuất bài học.
  if (lastUserMessage.length < 5) return; // Quá ngắn thì bỏ qua

  try {
    logger.info(`[MEMORY-ENGINE] Silent reflection on feedback: "${lastUserMessage}"`);
    
    // Ở bản này, ta detect các mẫu "Negative Feedback" để learn
    const isNegative = /không được|không thích|sai rồi|đừng|tại sao|tệ quá/i.test(lastUserMessage);
    
    if (isNegative && relatedProposal) {
      // Phân loại hạng mục
      let category: any = 'scaling';
      if (relatedProposal.id.includes('ngansach')) category = 'budget';
      if (relatedProposal.id.includes('creative')) category = 'creative';
      
      const insight = `Sếp từ chối đề xuất "${relatedProposal.title}" vì: ${lastUserMessage}. Rút kinh nghiệm: Cần cẩn trọng hơn khi đề xuất hành động này trong bối cảnh tương tự.`;
      
      await saveStrategicMemory(config, {
        campaignId: relatedProposal.campaignId,
        category,
        insight,
        confidenceScore: 0.85
      });
      
      logger.info(`[MEMORY-ENGINE] Silent lesson learned saved for ${category}.`);
    }
  } catch (error) {
    logger.error(`[MEMORY-ENGINE] Reflection failed: ${error}`);
  }
}

/**
 * Bridge function cho Assistant để tự lưu bài học chủ động.
 */
export async function recordLessonLearned(config: AdsManagerPluginConfig, insight: string, category: any): Promise<void> {
  await saveStrategicMemory(config, {
    category,
    insight,
    confidenceScore: 0.9
  });
}
