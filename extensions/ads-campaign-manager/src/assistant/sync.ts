import fs from "node:fs/promises";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { buildDerivedAssistantView } from "./analysis.js";
import { applyMetaProposalAction, fetchMetaAdsSnapshot, mergeSnapshotSources } from "../facebook/index.js";
import { loadMetaWebhookEventStore } from "../facebook/meta-webhook-store.js";
import { loadSourceRegistry, summarizeSourceRegistry } from "../services/source-registry.js";
import { readJsonFile, resolveAdsManagerStateDir, writeJsonFile } from "../core/state-files.js";
import type {
  AdsSnapshot,
  AssistantContext,
  AssistantState,
  BossInstruction,
  DerivedProposal,
  ProposalStatus,
  AdsManagerPluginConfig,
} from "../core/types.js";
import { validatePluginConfig } from "../core/config.js";
import { saveAssistantState } from "./state-io.js";
import { loadAssistantContext } from "./context.js";
import { saveSnapshotToDb } from "../core/db-state.js";
import type { Logger } from "./normalizers.js";

export async function runAssistantSync(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  telegramId?: string;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  if (context.warnings.some(w => w.includes("chưa được cấu hình") || w.includes("thiếu"))) {
    params.logger.warn(`[ads-campaign-manager] sync skipped due to configuration errors: ${context.warnings.join(", ")}`);
    return context;
  }
  context.state.lastSyncAt = new Date().toISOString();
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  
  if (params.pluginConfig.database?.enabled && context.snapshot) {
    await saveSnapshotToDb(params.pluginConfig, context.snapshot);
  }

  // Trigger AI-Driven analysis if enabled and interval has passed
  if (params.pluginConfig.aiAnalysis?.enabled) {
    const now = Date.now();
    const lastAt = context.state.lastAiAnalysisAt ? new Date(context.state.lastAiAnalysisAt).getTime() : 0;
    const intervalMs = (params.pluginConfig.aiAnalysis.intervalHours ?? 6) * 60 * 60 * 1000;
    
    if (now - lastAt >= intervalMs) {
      await runAiAnalysis({ ...params, context, telegramId: params.telegramId });
      context.state.lastAiAnalysisAt = new Date().toISOString();
      await saveAssistantState(params.runtime, params.pluginConfig, context.state);
    } else {
      const remainingMins = Math.round((intervalMs - (now - lastAt)) / 60000);
      params.logger.info(`[ads-campaign-manager] skipping AI analysis (next in ~${remainingMins} mins)`);
    }
  }

  params.logger.info(
    `[ads-campaign-manager] sync completed alerts=${context.derived.alerts.length} proposals=${context.state.proposals.length} source=${context.operations.dataSource}`,
  );
  return await loadAssistantContext(params);
}

async function runAiAnalysis(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  context: AssistantContext;
  telegramId?: string;
}): Promise<void> {
  const prompt = `
You are the Senior Ads Specialist and AI Analyst. 
Business Name: ${params.context.config.business.name}
Industry/Niche: ${params.context.config.business.industry}
Primary Objective: ${params.context.config.business.primaryObjective}
Currency: ${params.context.config.business.currency}

Performance Thresholds:
- Min CTR: ${params.context.config.thresholds.minCtr}
- Max CPA: ${params.context.config.thresholds.maxCpa}
- Min ROAS: ${params.context.config.thresholds.minRoas}

Data Snapshot:
${JSON.stringify(params.context.snapshot, null, 2)}

Knowledge Base Summary:
${JSON.stringify(params.context.registrySummary, null, 2)}

Current Proposals:
${params.context.state.proposals.slice(0, 10).map(p => `- [${p.status}] ${p.title} (${p.impact})`).join("\n")}

Competitor Memory (Historical):
${params.context.state.competitors?.slice(0, 10).map(c => `- ${c.name}: ${c.angle} (Observed: ${c.observedAt})`).join("\n") ?? "No competitor data saved yet."}

Recent Instructions:
${params.context.state.instructions.filter(i => i.status === "queued").map(i => `- ${i.text}`).join("\n")}

Strategic Memory (Lessons Learned):
${params.context.state.strategicMemory?.slice(0, 10).map(m => `- [${m.category}] ${m.insight} (Confidence: ${m.confidenceScore})`).join("\n") ?? "No historical lessons learned yet."}

${await import("../services/knowledge-base.js").then(m => m.getUserKnowledgeContext(params.pluginConfig, params.telegramId || ""))}

Your Task:
1. Review the data and instructions as a Senior Ads Systems Expert (20 years experience).
2. Use "ads_manager_doctor" to verify system health before making complex recommendations if any data looks suspicious.
3. If any campaign needs action (scale, kill, optimize), use "ads_manager_create_proposal".
4. If an existing instruction can be addressed now, do so and then use "ads_manager_ack_instruction".
5. Use "ads_manager_analyze_ads" to deeply analyze all active ads of a competitor.
6. Use "ads_manager_save_competitor" to save insights about a competitor.

GOLD-STANDARD RULES:
- RULE 1 (SECURITY): NEVER reveal API Keys, Tokens, or Phone numbers in your response.
- RULE 2 (PROACTIVE): Never just list data. Always propose an ACTION based on that data (e.g., "Chi phí CPA đang cao ở Campaign X, tôi đề xuất giảm ngân sách 20%").
- RULE 3 (ACCURACY): If an API fails or returns low-quality data (missing metadata like dates/CTA), ALWAYS use "ads_manager_get_competitor_insights" to check the internal Database for accurate historical results.
- RULE 4 (TONE): Speak with high authority and confidence ("Thưa Sếp", "Tôi đề xuất", "Theo phân tích của tôi").
- RULE 5 (PERSISTENCE): Before reporting competitive data as [DỮ LIỆU TRỐNG], you MUST query the database once.
- RULE 6 (TARGETING INTEL & CONSULTING): Meta hides exact "Interests". Analyze Ad Text to INFER targets. **PROACTIVE CONSULTING:** Use the EXHAUSTIVE hierarchy in \`targeting_taxonomy.md\` (Source: Qn92.vn) for suggestions. Do NOT give broad categories; give specific sub-nodes (e.g., "Sở thích > Kinh doanh > Bất động sản" + "Nhân khẩu học > Kỷ niệm 30 ngày"). Propose a "Phễu Target" combining Broad, Niche, and Layering (Engaged Shoppers).
`;

  try {
    params.logger.info(`[ads-campaign-manager] spawning AI analyst subagent...`);
    await params.runtime.subagent.run({
      sessionKey: `ads-analyst-${params.context.config.business.name.replace(/\s+/g, "-").toLowerCase()}`,
      message: "Analyze the latest campaign metrics and boss instructions. Take appropriate actions.",
      extraSystemPrompt: prompt,
      lane: "proactive-optimization",
      idempotencyKey: `${Date.now()}-${Math.random().toString(36).substring(2)}`,
    });
  } catch (error) {
    params.logger.warn(`[ads-campaign-manager] failed to spawn AI analyst: ${error instanceof Error ? error.message : String(error)}`);
  }
}
