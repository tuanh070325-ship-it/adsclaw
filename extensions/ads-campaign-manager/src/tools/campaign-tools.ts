
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { AdsManagerPluginConfig } from "../core/types.js";


import {
  loadAssistantContext, setProposalStatus,
  acknowledgeInstruction, createProposal, appendCompetitorInsight,
} from "../assistant/index.js";
import { performWebSearch } from "../services/web-search.js";
import { scrapePage } from "../services/scraper.js";
import { analyzeCompetitorAdsWithApify } from "../services/apify-service.js";
import {
  httpFetch, serperSearch,
  fetchFacebookAdLibrary, apifyFacebookAdsScraper,
  scrapeCreatorsIndustrySearch, googleAdsSearch,
  buildAdLibraryUrl, fetchMetaAccountData, calcHealthScore,
  safeStr, type AdLibraryResult, type MetaCampaignData,
} from "../http/index.js";
import { resolvePageId, extractPageSlugFromUrl, findPageDisplayName } from "../facebook/index.js";
import { syncBusinessData } from "../assistant/business-sync.js";
import { 
  saveCompetitorAdToDb, 
  saveMarketBenchmarkToDb,
  initPhase3Tables
} from "../core/db-state.js";
import { 
  getFormulaAuditTrail, 
  detectMetricAnomaly 
} from "../core/ad-math.js";


import { BRIEF_MODES, type BriefMode, stringEnum, buildPayload } from "./helpers.js";

export function createToolGroup(params: { api: OpenClawPluginApi; pluginConfig: AdsManagerPluginConfig; }): AnyAgentTool[] {
  const { api, pluginConfig } = params;
  const runtime = api.runtime;
  const logger = api.logger;
  const briefTool: AnyAgentTool = {
    name: "ads_manager_brief",
    label: "Ads Manager Brief",
    description: "Read-only snapshot. Modes: report|overview|alerts|budget|plan|proposals|competitors.",
    parameters: Type.Object({ mode: Type.Optional(stringEnum(BRIEF_MODES, "View mode")) }, { additionalProperties: false }),
    execute: async (_id, raw) => {
      const mode = ((raw as any).mode ?? "report") as BriefMode;
      const ctx = await loadAssistantContext({ runtime, logger, pluginConfig });
      const payload = buildPayload(mode, ctx);
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }], details: payload };
    },
  };

  // ─ Tool 2: ads_manager_create_proposal ───────────────────────────────────
  const createProposalTool: AnyAgentTool = {
    name: "ads_manager_create_proposal",
    label: "Create Ads Proposal",
    description: "Create proposal for boss approval. Required for any campaign changes. Use CEP protocol.",
    parameters: Type.Object({ title: Type.String(), summary: Type.String(), reason: Type.String(), impact: Type.String({ description: "high/medium/low" }), campaignId: Type.Optional(Type.String()), commandHint: Type.Optional(Type.String()) }),
    execute: async (_id, raw: any) => {
      const ctx = await createProposal({ runtime, logger, pluginConfig, proposal: raw });
      const pending = ctx.state.proposals.filter(p => p.status === "pending").length;
      return { content: [{ type: "text" as const, text: `✅ Proposal created. Pending: ${pending}.\n→ /pheduyet ${ctx.state.proposals[0]?.id}` }], details: ctx.state.proposals[0] };
    },
  };

  // ─ Tool 3: ads_manager_execute_action ────────────────────────────────────
  const executeActionTool: AnyAgentTool = {
    name: "ads_manager_execute_action",
    label: "Execute Ads Action (CEP Step 2)",
    description: "Approve or reject proposal. ALWAYS confirm with boss first (CEP). Reject is safe — no confirmation needed.",
    parameters: Type.Object({ proposalId: Type.String(), status: stringEnum(["approved", "rejected"], "New status") }),
    execute: async (_id, raw: any) => {
      const ctx = await setProposalStatus({ runtime, logger, pluginConfig, proposalId: raw.proposalId, status: raw.status });
      const emoji = raw.status === "approved" ? "✅" : "🚫";
      return { content: [{ type: "text" as const, text: `${emoji} Proposal ${raw.proposalId} → ${raw.status}.` }], details: ctx.state.proposals.find(p => p.id === raw.proposalId) };
    },
  };

  // ─ Tool 4: ads_manager_ack_instruction ───────────────────────────────────
  const ackInstructionTool: AnyAgentTool = {
    name: "ads_manager_ack_instruction",
    label: "Acknowledge Boss Instruction",
    description: "Mark instruction as acknowledged after executing.",
    parameters: Type.Object({ instructionId: Type.String() }),
    execute: async (_id, raw: any) => {
      const ctx = await acknowledgeInstruction({ runtime, logger, pluginConfig, instructionId: raw.instructionId });
      return { content: [{ type: "text" as const, text: `✅ Instruction ${raw.instructionId} acknowledged.` }], details: ctx.state.instructions.find(i => i.id === raw.instructionId) };
    },
  };

  // ─ Tool 5: ads_manager_search ────────────────────────────────────────────
  const searchTool: AnyAgentTool = {
    name: "ads_manager_search",
    label: "Web Search (via config)",
    description: "Web search via intelligence.search config.",
    parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number({ default: 5 })) }),
    execute: async (_id, raw: any) => {
      const results = await performWebSearch({ config: pluginConfig, query: raw.query, limit: raw.limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }], details: results };
    },
  };

  // ─ Tool 6: ads_manager_scrape ────────────────────────────────────────────
  const scrapeTool: AnyAgentTool = {
    name: "ads_manager_scrape",
    label: "Page Scraper",
    description: "Scrape URL content. Requires intelligence.scrape.enabled=true.",
    parameters: Type.Object({ url: Type.String() }),
    execute: async (_id, raw: any) => {
      const result = await scrapePage({ config: pluginConfig, url: raw.url });
      return { content: [{ type: "text" as const, text: `${result.title}\n\n${result.content.slice(0, 2000)}` }], details: result };
    },
  };

  // ─ Tool 7: ads_manager_analyze_ads ───────────────────────────────────────
  const analyzeAdsTool: AnyAgentTool = {
    name: "ads_manager_analyze_ads",
    label: "Ad Analyzer (Apify via config)",
    description: "Analyze competitor ads via Apify config. Requires intelligence.apify.enabled=true.",
    parameters: Type.Object({ url: Type.String(), limit: Type.Optional(Type.Number({ default: 10 })) }),
    execute: async (_id, raw: any) => {
      const results = await analyzeCompetitorAdsWithApify({ config: pluginConfig, searchQuery: raw.url, limit: raw.limit });
      return { content: [{ type: "text" as const, text: `Found ${results.length} ads.` }], details: results };
    },
  };

  // ─ Tool 8: ads_manager_save_competitor ───────────────────────────────────
  const saveCompetitorTool: AnyAgentTool = {
    name: "ads_manager_save_competitor",
    label: "Save Competitor to Memory & DB",
    description: "ALWAYS call after competitor analysis. Persists findings across sessions. Data is saved in the structured MySQL database for mathematical analysis.",
    parameters: Type.Object({ 
      name: Type.String({ description: "Display name" }), 
      angle: Type.String({ description: "Dominant angle" }), 
      note: Type.Optional(Type.String({ description: "Detailed summary" })), 
      sourceUrl: Type.Optional(Type.String()),
      ads: Type.Optional(Type.Array(Type.Object({
        id: Type.String(),
        adText: Type.Optional(Type.String()),
        mediaUrl: Type.Optional(Type.String()),
        mediaType: Type.Optional(Type.String()),
        startDate: Type.Optional(Type.String())
      })))
    }),
    execute: async (_id, raw: any) => {
      // 1. Save to state (for current session memory)
      await appendCompetitorInsight({ runtime, logger, pluginConfig, competitor: { name: raw.name, angle: raw.angle, note: raw.note, sourceUrl: raw.sourceUrl } });
      
      // 2. Save detailed ads to MySQL DB for Phase 3 analytics
      if (Array.isArray(raw.ads)) {
        for (const ad of raw.ads) {
          const mType = (ad.mediaType?.includes('video') ? 'video' : ad.mediaType?.includes('image') ? 'image' : ad.mediaType?.includes('carousel') ? 'carousel' : 'other') as any;
          const startedAt = ad.startDate ? ad.startDate.split('T')[0] : null;
          const duration = ad.startDate ? Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86400000) : 0;
          
          await saveCompetitorAdToDb(pluginConfig, {
            id: ad.id,
            pageName: raw.name,
            hookText: ad.adText,
            mediaUrl: ad.mediaUrl,
            mediaType: mType,
            startedAt: startedAt ?? undefined,
            durationDays: duration >= 0 ? duration : 0,
            isActive: true
          });
        }
      }

      return { content: [{ type: "text" as const, text: `✅ Saved "${raw.name}" and ${raw.ads?.length ?? 0} ads to DB.` }], details: { success: true, name: raw.name } };
    },
  };

  return [briefTool, createProposalTool, executeActionTool, ackInstructionTool, searchTool, scrapeTool, analyzeAdsTool, saveCompetitorTool];
}
