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
import { fetchMetaAccountsHealth, getUserFacebookPages, initPhase3Tables } from "../core/db-state.js";
import { loadAssistantState, loadConfiguredSnapshot } from "./state-io.js";
import { defaultState } from "./normalizers.js";
import type { Logger } from "./normalizers.js";
import { runPreToolHooks } from "./hooks.js";

export function mergeProposals(params: {
  generated: DerivedProposal[];
  existing: DerivedProposal[];
}): DerivedProposal[] {
  const existingById = new Map(params.existing.map((proposal) => [proposal.id, proposal]));
  const merged: DerivedProposal[] = [];

  for (const proposal of params.generated) {
    const previous = existingById.get(proposal.id);
    if (previous) {
      merged.push({
        ...proposal,
        status: previous.status,
        createdAt: previous.createdAt,
        updatedAt: previous.updatedAt,
      });
      existingById.delete(proposal.id);
    } else {
      merged.push(proposal);
    }
  }

  for (const proposal of existingById.values()) {
    if (proposal.status !== "pending") {
      merged.push(proposal);
    }
  }

  return merged;
}

export async function loadAssistantContext(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
}): Promise<AssistantContext> {
  const registry = await loadSourceRegistry(params.pluginConfig.sourceRegistryPath);
  const registrySummary = summarizeSourceRegistry(registry);

  const effectiveConfig = { ...params.pluginConfig };
  
  const configErrors = validatePluginConfig(effectiveConfig);
  const warnings: string[] = [...configErrors];

  // Attempt to load DB credentials and merge into config
  if (effectiveConfig.database?.enabled) {
    try {
      const { initPhase3Tables } = await import("../core/db-state.js");
      await initPhase3Tables(effectiveConfig);

      const businessId = Buffer.from(effectiveConfig.business.name).toString("base64").slice(0, 64);
      const { executeQuery } = await import("../core/db.js");
      const dbConfig = await (executeQuery as any)(effectiveConfig, "SELECT meta_access_token, meta_ad_account_id, meta_app_id, meta_app_secret FROM business_config WHERE id = ?", [businessId]);

      if (dbConfig && dbConfig.length > 0) {
        const row = dbConfig[0];
        if (row.meta_access_token && row.meta_ad_account_id) {
          effectiveConfig.meta = {
            ...effectiveConfig.meta,
            enabled: true,
            accessToken: row.meta_access_token,
            adAccountId: row.meta_ad_account_id,
            appId: row.meta_app_id || effectiveConfig.meta.appId,
            appSecret: row.meta_app_secret || effectiveConfig.meta.appSecret,
          };
          // Switch to live mode if credentials exist and it's not explicitly snapshot-only
          if (effectiveConfig.syncMode !== "snapshot") {
            effectiveConfig.syncMode = "meta_api";
          }
        }
      }
    } catch (e: any) {
      params.logger.warn(`[CONTEXT] DB initialization failed: ${e.message}`);
      warnings.push(`Cơ sở dữ liệu chưa sẵn sàng: ${e.message}`);
    }
  }

  let state: AssistantState;
  let snapshotResult: Awaited<ReturnType<typeof loadConfiguredSnapshot>>;
  let eventStore: Awaited<ReturnType<typeof loadMetaWebhookEventStore>>;

  if (configErrors.length > 0) {
    state = defaultState();
    snapshotResult = { snapshot: null, warnings: [], dataSource: "none" };
    eventStore = { version: 1, events: [] };
  } else {
    try {
      state = await loadAssistantState(params.runtime, effectiveConfig);
      snapshotResult = await loadConfiguredSnapshot({
        pluginConfig: effectiveConfig,
        logger: params.logger,
      });
      eventStore = await loadMetaWebhookEventStore(params.runtime);
    } catch (e: any) {
      params.logger.error(`[CONTEXT] Failed to load assistant state/snapshot: ${e.message}`);
      state = defaultState();
      snapshotResult = { snapshot: null, warnings: [e.message], dataSource: "none" };
      eventStore = { version: 1, events: [] };
    }
  }

  const derived = buildDerivedAssistantView({
    snapshot: snapshotResult.snapshot,
    state,
    config: effectiveConfig, // Use effectiveConfig here
  });

  state.proposals = mergeProposals({
    generated: derived.generatedProposals,
    existing: state.proposals,
  });
  derived.generatedProposals = state.proposals;

  // Safe DB fetches for UI enrichment
  let accounts: any[] = [];
  let pages: any[] = [];
  try {
    const { fetchMetaAccountsHealth, getUserFacebookPages } = await import("../core/db-state.js");
    accounts = await fetchMetaAccountsHealth(effectiveConfig);
    pages = await getUserFacebookPages(effectiveConfig);
  } catch (e: any) {
    params.logger.warn(`[CONTEXT] Async DB fetches failed: ${e.message}`);
  }

  const initialContext: AssistantContext = {
    config: effectiveConfig,
    registry,
    registrySummary,
    snapshot: snapshotResult.snapshot,
    state,
    derived,
    operations: {
      dataSource: snapshotResult.dataSource,
      recentWebhookEvents: eventStore.events.length,
      lastWebhookEventAt: eventStore.events[0]?.receivedAt,
      webhookPath: effectiveConfig.meta.enabled ? effectiveConfig.meta.webhookPath : undefined,
      liveWritesEnabled:
        !effectiveConfig.safeMode &&
        effectiveConfig.meta.enabled &&
        effectiveConfig.execution.enableMetaWrites,
      accounts,
      pages,
      selectedPageId: pages.find((p) => p.is_selected)?.id,
    },
    warnings,
  };

  // ECC Feature: Phase 2 Hooks - Inject Instincts/Memory
  const hookResult = await runPreToolHooks(effectiveConfig, initialContext);
  if (hookResult.reason) {
    initialContext.warnings.push(hookResult.reason);
  }

  return initialContext;
}
