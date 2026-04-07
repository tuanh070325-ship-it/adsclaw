import fs from "node:fs/promises";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { buildDerivedAssistantView } from "./analysis.js";
import { applyMetaProposalAction, fetchMetaAdsSnapshot, mergeSnapshotSources } from "../facebook/index.js";
import { checkPixelHealth } from "../facebook/pixel-health.js";
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
import type { Logger } from "./normalizers.js";
import { autoEvolveInstincts } from "./instincts.js";
import { runPostToolHooks } from "./hooks.js";
import { reflectOnUserFeedback } from "./memory-engine.js";

export async function setProposalStatus(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  proposalId: string;
  status: ProposalStatus;
  feedback?: string;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  const proposal = context.state.proposals.find((entry) => entry.id === params.proposalId);
  if (!proposal) {
    throw new Error(`Proposal ${params.proposalId} was not found.`);
  }
  proposal.status = params.status;
  proposal.updatedAt = new Date().toISOString();
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);

  let executionNote: string | undefined;
  if (params.status === "approved") {
    // Lớp bảo vệ số 1: Zero-Trust Protocol cho Scale Up Budget
    if (proposal.id.startsWith("tangngansach_")) {
      const campaignId = proposal.campaignId;
      if (campaignId) {
        const pixelReport = await checkPixelHealth(params.pluginConfig, campaignId);
        if (pixelReport && pixelReport.score < 60) {
          proposal.status = "rejected";
          proposal.updatedAt = new Date().toISOString();
          await saveAssistantState(params.runtime, params.pluginConfig, context.state);
          
          throw new Error(`👉 TÌNH TRẠNG (HỆ THỐNG CHẶN SCALE):\n• [PIXEL_HEALTH_BLOCK] Pixel Health Score là ${pixelReport.score}/100 (< 60).\n• Cảnh báo: Lệnh chặn ngân sách đang Bật do Score < 60.\n\n🔍 CẤU TRÚC LỖI:\n${pixelReport.warnings.join("\n")}\n\n⚡ HƯỚNG DẪN FIX:\nSếp cần fix ngay các lỗi tracking này trước khi yêu cầu scale camp!`);
        }
      }
    }

    try {
      executionNote = await applyMetaProposalAction({
        config: params.pluginConfig,
        snapshot: context.snapshot,
        proposal,
      });
    } catch (error) {
      executionNote = `Live execution failed: ${error instanceof Error ? error.message : String(error)}`;
      params.logger.warn(`[ads-campaign-manager] ${executionNote}`);
    }

    const refreshed = await loadAssistantContext(params);

    // ECC Post-Tool Hook: AgentShield Security Scan
    const shieldResult = await runPostToolHooks(params.pluginConfig, { executionNote, proposal });
    if (shieldResult.shieldAlert) {
      params.logger.warn(`[AgentShield] ${shieldResult.shieldAlert}`);
      if (refreshed?.warnings) {
        refreshed.warnings.push(shieldResult.shieldAlert);
      }
    }
    
    if (executionNote) {
      refreshed.warnings.push(executionNote);
    }
    return refreshed;
  }

  // Phase 3: Silent Learning on Rejection
  if (params.status === "rejected" && params.feedback) {
    await reflectOnUserFeedback({
      config: params.pluginConfig,
      context,
      lastUserMessage: params.feedback,
      relatedProposal: proposal
    });
  }

  return await loadAssistantContext(params);
}

export async function appendBossInstruction(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  text: string;
}): Promise<{ context: AssistantContext; instruction: BossInstruction }> {
  const context = await loadAssistantContext(params);
  const instruction: BossInstruction = {
    id: `cmd_${Date.now().toString(36)}`,
    text: params.text.trim(),
    createdAt: new Date().toISOString(),
    status: "queued",
  };
  context.state.instructions.unshift(instruction);
  context.state.instructions = context.state.instructions.slice(0, 50);
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);

  // ECC Feature: Continuous Learning - Auto evolve instincts/memory from instruction
  await autoEvolveInstincts(params.pluginConfig, params.text);
  await reflectOnUserFeedback({
    config: params.pluginConfig,
    context,
    lastUserMessage: params.text
  });

  const refreshed = await loadAssistantContext(params);
  return {
    context: refreshed,
    instruction:
      refreshed.state.instructions.find((entry) => entry.id === instruction.id) ?? instruction,
  };
}

export async function createProposal(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  proposal: Omit<DerivedProposal, "id" | "status" | "createdAt" | "updatedAt">;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  const now = new Date().toISOString();
  const id = `ai_${Date.now().toString(36)}`;
  
  // Tier 1: Autonomous Execution for low-impact changes (e.g. pausing a dead ad)
  const isAutoTier = !params.pluginConfig.safeMode && params.proposal.impact === "low";
  const initialStatus = isAutoTier ? "approved" : "pending";

  const proposal: DerivedProposal = {
    ...params.proposal,
    id,
    status: initialStatus,
    createdAt: now,
    updatedAt: now,
  };
  context.state.proposals.unshift(proposal);
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);

  if (isAutoTier && params.pluginConfig.execution.enableMetaWrites) {
    params.logger.info(`[ads-campaign-manager] Auto-executing Tier 1 proposal: ${proposal.title}`);
    try {
      await applyMetaProposalAction({
        config: params.pluginConfig,
        snapshot: context.snapshot,
        proposal,
      });
    } catch (e) {
      params.logger.error(`[ads-campaign-manager] Auto-Tier 1 failed: ${e}`);
    }
  }

  return await loadAssistantContext(params);
}

export async function acknowledgeInstruction(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  instructionId: string;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  const instruction = context.state.instructions.find((entry) => entry.id === params.instructionId);
  if (instruction) {
    instruction.status = "acknowledged";
    await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  }
  return await loadAssistantContext(params);
}

export async function appendCompetitorInsight(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  competitor: Omit<NonNullable<AdsSnapshot["competitors"]>[number], "observedAt">;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  if (!context.state.competitors) {
    context.state.competitors = [];
  }
  
  const entry = {
    ...params.competitor,
    observedAt: new Date().toISOString(),
  };

  // Prevent duplicates by name or URL
  const existing = context.state.competitors.find(c => c.name === entry.name || (c.sourceUrl && c.sourceUrl === entry.sourceUrl));
  if (existing) {
    Object.assign(existing, entry);
  } else {
    context.state.competitors.unshift(entry);
  }
  
  context.state.competitors = context.state.competitors.slice(0, 50);
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  return await loadAssistantContext(params);
}
