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
import { loadStateFromDb, saveStateToDb, saveSnapshotToDb, initPhase3Tables, fetchMetaAccountsHealth, getUserFacebookPages } from "../core/db-state.js";
import { defaultState, normalizeProposal, normalizeInstruction, normalizeSnapshotCompetitor, normalizeSnapshot, readRecord, readString, STATE_FILENAME } from "./normalizers.js";
import type { Logger } from "./normalizers.js";

export function resolveStateFile(runtime: PluginRuntime): string {
  return path.join(resolveAdsManagerStateDir(runtime), STATE_FILENAME);
}


export async function loadAssistantState(runtime: PluginRuntime, config: AdsManagerPluginConfig): Promise<AssistantState> {
  if (config.database?.enabled) {
    await initPhase3Tables(config);
    return loadStateFromDb(config);
  }
  const parsed = await readJsonFile(resolveStateFile(runtime));
  const record = readRecord(parsed);
  if (!record) {
    return defaultState();
  }
  const proposals = Array.isArray(record.proposals)
    ? record.proposals
        .map(normalizeProposal)
        .filter((proposal): proposal is DerivedProposal => proposal !== null)
    : [];
  const instructions = Array.isArray(record.instructions)
    ? record.instructions
        .map(normalizeInstruction)
        .filter((instruction): instruction is BossInstruction => instruction !== null)
    : [];
  return {
    version: 1,
    lastSyncAt: readString(record.lastSyncAt),
    lastAiAnalysisAt: readString(record.lastAiAnalysisAt),
    proposals: proposals,
    instructions: instructions,
    competitors: Array.isArray(record.competitors)
      ? record.competitors
          .map(normalizeSnapshotCompetitor)
          .filter((c): c is NonNullable<typeof c> => c !== null)
      : [],
    strategicMemory: Array.isArray(record.strategicMemory) ? record.strategicMemory : [],
  };
}

export async function saveAssistantState(runtime: PluginRuntime, config: AdsManagerPluginConfig, state: AssistantState): Promise<void> {
  if (config.database?.enabled) {
    await saveStateToDb(config, state);
    return;
  }
  await fs.mkdir(resolveAdsManagerStateDir(runtime), { recursive: true });
  await writeJsonFile(resolveStateFile(runtime), state);
}

export async function loadLocalSnapshot(snapshotPath: string | undefined): Promise<AdsSnapshot | null> {
  if (!snapshotPath) {
    return null;
  }
  const raw = await fs.readFile(snapshotPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeSnapshot(parsed);
}

export async function loadConfiguredSnapshot(params: {
  pluginConfig: AdsManagerPluginConfig;
  logger: Logger;
}): Promise<{
  snapshot: AdsSnapshot | null;
  warnings: string[];
  dataSource: AssistantContext["operations"]["dataSource"];
}> {
  const warnings: string[] = [];
  const wantsLocal =
    params.pluginConfig.syncMode === "snapshot" || params.pluginConfig.syncMode === "hybrid";
  const wantsMeta =
    params.pluginConfig.syncMode === "meta_api" || params.pluginConfig.syncMode === "hybrid";

  let localSnapshot: AdsSnapshot | null = null;
  let metaSnapshot: AdsSnapshot | null = null;

  if (wantsLocal) {
    if (!params.pluginConfig.snapshotPath) {
      warnings.push("snapshotPath is not configured yet.");
    } else {
      try {
        localSnapshot = await loadLocalSnapshot(params.pluginConfig.snapshotPath);
        if (!localSnapshot) {
          warnings.push("Snapshot file exists but could not be normalized.");
        }
      } catch (error) {
        warnings.push(
          `Snapshot load failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (wantsMeta) {
    if (!params.pluginConfig.meta.enabled) {
      warnings.push("Meta live sync is disabled in plugin config.");
    } else {
      try {
        const result = await fetchMetaAdsSnapshot({
          config: params.pluginConfig,
          logger: params.logger,
        });
        metaSnapshot = result.snapshot;
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push(
          `Meta live sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (params.pluginConfig.syncMode === "snapshot") {
    return {
      snapshot: localSnapshot,
      warnings,
      dataSource: localSnapshot ? "snapshot" : "none",
    };
  }

  if (params.pluginConfig.syncMode === "meta_api") {
    if (metaSnapshot) {
      return {
        snapshot: metaSnapshot,
        warnings,
        dataSource: "meta_api",
      };
    }
    return {
      snapshot: localSnapshot,
      warnings,
      dataSource: localSnapshot ? "snapshot" : "none",
    };
  }

  const merged = mergeSnapshotSources({
    primary: metaSnapshot,
    fallback: localSnapshot,
  });
  return {
    snapshot: merged,
    warnings,
    dataSource: metaSnapshot && localSnapshot ? "hybrid" : metaSnapshot ? "meta_api" : localSnapshot ? "snapshot" : "none",
  };
}
