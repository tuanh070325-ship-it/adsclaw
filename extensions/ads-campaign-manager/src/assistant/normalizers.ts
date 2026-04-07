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

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export const STATE_FILENAME = "assistant-state.json";
export function defaultState(): AssistantState {
  return {
    version: 1,
    proposals: [],
    instructions: [],
    competitors: [],
  };
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeSnapshotCampaign(value: unknown): AdsSnapshot["campaigns"][number] | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const name = readString(record.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    objective: readString(record.objective),
    status: readString(record.status),
    spendToday: readNumber(record.spendToday),
    budget: readNumber(record.budget),
    budgetKind:
      record.budgetKind === "daily" || record.budgetKind === "lifetime"
        ? record.budgetKind
        : undefined,
    roas: readNumber(record.roas),
    ctr: readNumber(record.ctr),
    cpa: readNumber(record.cpa),
    cvr: readNumber(record.cvr),
    learningPhase: typeof record.learningPhase === "boolean" ? record.learningPhase : undefined,
    region: readString(record.region),
    audience: readString(record.audience),
    notes: readStringArray(record.notes),
  };
}

export function normalizeSnapshotCompetitor(
  value: unknown,
): NonNullable<AdsSnapshot["competitors"]>[number] | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const name = readString(record.name);
  if (!name) {
    return null;
  }
  return {
    id: readString(record.id),
    name,
    region: readString(record.region),
    angle: readString(record.angle),
    observedAt: readString(record.observedAt),
    note: readString(record.note),
    sourceUrl: readString(record.sourceUrl),
  };
}

export function normalizeSnapshot(value: unknown): AdsSnapshot | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const accountRecord = readRecord(record.account);
  const campaigns = Array.isArray(record.campaigns)
    ? record.campaigns
        .map(normalizeSnapshotCampaign)
        .filter((campaign): campaign is NonNullable<typeof campaign> => campaign !== null)
    : [];

  return {
    generatedAt: readString(record.generatedAt),
    account: accountRecord
      ? {
          id: readString(accountRecord.id),
          name: readString(accountRecord.name),
          objective: readString(accountRecord.objective),
          currency: readString(accountRecord.currency),
          status: readString(accountRecord.status),
          spendToday: readNumber(accountRecord.spendToday),
          spendYesterday: readNumber(accountRecord.spendYesterday),
          budgetToday: readNumber(accountRecord.budgetToday),
          roas: readNumber(accountRecord.roas),
          ctr: readNumber(accountRecord.ctr),
          cpa: readNumber(accountRecord.cpa),
        }
      : undefined,
    campaigns,
    competitors: Array.isArray(record.competitors)
      ? record.competitors
          .map(normalizeSnapshotCompetitor)
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : undefined,
    notes: readStringArray(record.notes),
  };
}

export function normalizeProposal(value: unknown): DerivedProposal | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const title = readString(record.title);
  const summary = readString(record.summary);
  const reason = readString(record.reason);
  const status = readString(record.status);
  const impact = readString(record.impact);
  if (!id || !title || !summary || !reason) {
    return null;
  }
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    return null;
  }
  if (impact !== "high" && impact !== "medium" && impact !== "low") {
    return null;
  }
  return {
    id,
    status,
    impact,
    title,
    summary,
    reason,
    campaignId: readString(record.campaignId),
    commandHint: readString(record.commandHint),
    createdAt: readString(record.createdAt) ?? new Date().toISOString(),
    updatedAt: readString(record.updatedAt) ?? new Date().toISOString(),
  };
}

export function normalizeInstruction(value: unknown): BossInstruction | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const text = readString(record.text);
  const createdAt = readString(record.createdAt);
  const status = readString(record.status);
  if (!id || !text || !createdAt) {
    return null;
  }
  if (status !== "queued" && status !== "acknowledged") {
    return null;
  }
  return {
    id,
    text,
    createdAt,
    status,
  };
}
