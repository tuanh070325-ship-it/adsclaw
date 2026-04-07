import type {
  AdsManagerPluginConfig,
  AdsSnapshot,
  CampaignBudgetKind,
  CampaignSnapshot,
  DerivedProposal,
} from "../core/types.js";
import {
  type Logger,
  readRecord,
  readString,
  readNumber,
  readArray,
  normalizeMetaAccountId,
  resolveMetaSecret,
  requestGraphJson
} from "./api-client.js";

type MetaCampaignRow = Record<string, unknown>;
type MetaInsightsRow = Record<string, unknown>;

type MetaFetchResult = {
  snapshot: AdsSnapshot;
  warnings: string[];
};

const PURCHASE_ACTION_HINTS = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
];


export function normalizePercentFraction(value: unknown): number | undefined {
  const number = readNumber(value);
  return number !== undefined ? number / 100 : undefined;
}

export function normalizeBudgetValue(value: unknown): number | undefined {
  const number = readNumber(value);
  return number !== undefined ? Math.round(number) : undefined;
}

export function isPurchaseActionType(actionType: string | undefined): boolean {
  if (!actionType) {
    return false;
  }
  const normalized = actionType.trim().toLowerCase();
  return PURCHASE_ACTION_HINTS.some((hint) => normalized.includes(hint));
}

export function sumMatchingActionValues(entries: unknown, matcher: (actionType: string | undefined) => boolean) {
  let total = 0;
  let matched = false;
  for (const entry of readArray(entries)) {
    const record = readRecord(entry);
    if (!record || !matcher(readString(record.action_type))) {
      continue;
    }
    const value = readNumber(record.value);
    if (value === undefined) {
      continue;
    }
    total += value;
    matched = true;
  }
  return matched ? total : undefined;
}

export function extractPurchaseRoas(row: MetaInsightsRow): number | undefined {
  const entries = readArray(row.purchase_roas);
  for (const entry of entries) {
    const record = readRecord(entry);
    const direct = readNumber(record?.value ?? entry);
    if (direct !== undefined) {
      return direct;
    }
  }
  return readNumber(row.purchase_roas);
}

export function extractPurchaseCpa(row: MetaInsightsRow): number | undefined {
  const explicit = sumMatchingActionValues(row.cost_per_action_type, isPurchaseActionType);
  if (explicit !== undefined) {
    return explicit;
  }
  const spend = readNumber(row.spend);
  const purchases = sumMatchingActionValues(row.actions, isPurchaseActionType);
  if (spend !== undefined && purchases && purchases > 0) {
    return spend / purchases;
  }
  return undefined;
}

export function normalizeMetaCampaign(row: MetaCampaignRow): CampaignSnapshot | null {
  const id = readString(row.id);
  const name = readString(row.name);
  if (!id || !name) {
    return null;
  }
  const dailyBudget = normalizeBudgetValue(row.daily_budget);
  const lifetimeBudget = normalizeBudgetValue(row.lifetime_budget);
  const budgetKind: CampaignBudgetKind | undefined =
    dailyBudget !== undefined ? "daily" : lifetimeBudget !== undefined ? "lifetime" : undefined;
  return {
    id,
    name,
    objective: readString(row.objective),
    status: readString(row.effective_status) ?? readString(row.status),
    budget: dailyBudget ?? lifetimeBudget ?? normalizeBudgetValue(row.budget_remaining),
    budgetKind,
    bidStrategy: (readString(row.bid_strategy) as any) ?? "UNKNOWN",
  };
}

export function applyInsightsToCampaign(campaign: CampaignSnapshot, row: MetaInsightsRow): CampaignSnapshot {
  return {
    ...campaign,
    spendToday: readNumber(row.spend),
    ctr: normalizePercentFraction(row.ctr),
    cpa: extractPurchaseCpa(row),
    roas: extractPurchaseRoas(row),
  };
}

export function buildMetaCampaigns(params: {
  campaignRows: MetaCampaignRow[];
  insightRows: MetaInsightsRow[];
}): CampaignSnapshot[] {
  const campaigns = new Map<string, CampaignSnapshot>();

  for (const row of params.campaignRows) {
    const campaign = normalizeMetaCampaign(row);
    if (!campaign) {
      continue;
    }
    campaigns.set(campaign.id, campaign);
  }

  for (const row of params.insightRows) {
    const campaignId = readString(row.campaign_id);
    if (!campaignId) {
      continue;
    }
    const existing = campaigns.get(campaignId) ?? {
      id: campaignId,
      name: readString(row.campaign_name) ?? campaignId,
    };
    campaigns.set(campaignId, applyInsightsToCampaign(existing, row));
  }

  return [...campaigns.values()].toSorted(
    (left, right) => (right.spendToday ?? 0) - (left.spendToday ?? 0),
  );
}

export async function fetchMetaAdsSnapshot(params: {
  config: AdsManagerPluginConfig;
  logger: Logger;
}): Promise<MetaFetchResult> {
  const accessToken = resolveMetaSecret(
    params.config.meta.accessToken,
    params.config.meta.accessTokenEnvVar,
  );
  const adAccountId = params.config.meta.adAccountId?.trim();
  if (!accessToken) {
    throw new Error("Meta access token is not configured.");
  }
  if (!adAccountId) {
    throw new Error("Meta adAccountId is not configured.");
  }

  const normalizedAccountId = normalizeMetaAccountId(adAccountId);
  const warnings: string[] = [];
  
  const batchRequests = [
    { method: "GET", relative_url: `${normalizedAccountId}?fields=id,name,account_status,currency,amount_spent,spend_cap` },
    { method: "GET", relative_url: `${normalizedAccountId}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining,bid_strategy&limit=${Math.min(params.config.meta.campaignLimit, 100)}` },
    { method: "GET", relative_url: `${normalizedAccountId}/insights?level=campaign&date_preset=${params.config.meta.insightsDatePreset}&fields=campaign_id,campaign_name,spend,ctr,actions,cost_per_action_type,purchase_roas&limit=${Math.min(params.config.meta.campaignLimit, 100)}` },
    { method: "GET", relative_url: `${normalizedAccountId}/insights?level=account&date_preset=${params.config.meta.insightsDatePreset}&fields=spend,ctr,actions,cost_per_action_type,purchase_roas&limit=1` },
    // Phase 2: Historical Insights for Spike & Fatigue Analysis
    { method: "GET", relative_url: `${normalizedAccountId}/insights?level=campaign&date_preset=last_7d&fields=campaign_id,spend,ctr,actions,cost_per_action_type,purchase_roas&limit=${Math.min(params.config.meta.campaignLimit, 100)}` },
    { method: "GET", relative_url: `${normalizedAccountId}/insights?level=campaign&date_preset=last_30d&fields=campaign_id,spend,ctr,actions,cost_per_action_type,purchase_roas&limit=${Math.min(params.config.meta.campaignLimit, 100)}` }
  ];

  params.logger.info(`[ads-campaign-manager] initiating meta batch sync batch_size=${batchRequests.length}`);

  const batchResponse: { code: number; body: string }[] = await requestGraphJson({
    config: params.config,
    accessToken,
    pathOrUrl: "/",
    method: "POST",
    body: {
      batch: JSON.stringify(batchRequests)
    }
  });

  const parseBatch = (index: number) => {
    const res = batchResponse[index];
    if (res.code >= 400) {
      throw new Error(`Batch component ${index} failed: ${res.body}`);
    }
    return JSON.parse(res.body);
  };

  const accountRow = parseBatch(0);
  const campaignPageData = parseBatch(1);
  const insightPageData = parseBatch(2);
  const accountInsightPageData = parseBatch(3);

  const campaignRows = Array.isArray(campaignPageData.data) ? campaignPageData.data : [];
  const insightRows = Array.isArray(insightPageData.data) ? insightPageData.data : [];
  const accountInsightRows = Array.isArray(accountInsightPageData.data) ? accountInsightPageData.data : [];
  const last7dRows = Array.isArray(parseBatch(4).data) ? parseBatch(4).data : [];
  const last30dRows = Array.isArray(parseBatch(5).data) ? parseBatch(5).data : [];

  if (campaignPageData.paging?.next) {
    warnings.push(`Meta campaign list reached pagination limit. Next page available.`);
  }

  const campaigns = buildMetaCampaigns({
    campaignRows,
    insightRows,
  });

  // Attach historical context for Phase 2 Proactive Monitoring
  for (const campaign of campaigns) {
    const row7d = last7dRows.find((r: any) => r.campaign_id === campaign.id);
    const row30d = last30dRows.find((r: any) => r.campaign_id === campaign.id);
    
    if (row7d || row30d) {
       campaign.historicalData = [];
       if (row7d) {
         campaign.historicalData.push({
           date: "last_7d_avg",
           spend: (readNumber(row7d.spend) ?? 0) / 7,
           cpa: extractPurchaseCpa(row7d) ?? 0,
           roas: extractPurchaseRoas(row7d) ?? 0
         });
       }
       if (row30d) {
         campaign.historicalData.push({
           date: "last_30d_avg",
           spend: (readNumber(row30d.spend) ?? 0) / 30,
           cpa: extractPurchaseCpa(row30d) ?? 0,
           roas: extractPurchaseRoas(row30d) ?? 0
         });
       }
    }
  }
  const accountInsights = accountInsightRows[0];
  const totalBudget = campaigns.reduce((sum, campaign) => sum + (campaign.budget ?? 0), 0);

  params.logger.info(
    `[ads-campaign-manager] meta batch sync complete account=${normalizedAccountId} campaigns=${campaigns.length}`,
  );

  return {
    snapshot: {
      generatedAt: new Date().toISOString(),
      account: {
        id: readString(accountRow.id),
        name: readString(accountRow.name),
        status: readString(accountRow.account_status),
        currency: readString(accountRow.currency) ?? params.config.business.currency,
        spendToday:
          readNumber(accountInsights?.spend) ?? campaigns.reduce((sum, campaign) => sum + (campaign.spendToday ?? 0), 0),
        budgetToday: totalBudget > 0 ? totalBudget : undefined,
        ctr: normalizePercentFraction(accountInsights?.ctr),
        cpa: accountInsights ? extractPurchaseCpa(accountInsights) : undefined,
        roas: accountInsights ? extractPurchaseRoas(accountInsights) : undefined,
      },
      campaigns,
      notes: [
        `Live data source: Meta Marketing API Batch (${normalizedAccountId})`,
        `Date preset: ${params.config.meta.insightsDatePreset}`,
      ],
    },
    warnings,
  };
}

export function mergeCampaignMetadata(
  primary: CampaignSnapshot,
  fallback: CampaignSnapshot | undefined,
): CampaignSnapshot {
  if (!fallback) {
    return primary;
  }
  return {
    ...primary,
    region: primary.region ?? fallback.region,
    audience: primary.audience ?? fallback.audience,
    notes:
      primary.notes && primary.notes.length > 0
        ? primary.notes
        : fallback.notes,
    learningPhase: primary.learningPhase ?? fallback.learningPhase,
  };
}

export function mergeSnapshotSources(params: {
  primary: AdsSnapshot | null;
  fallback: AdsSnapshot | null;
}): AdsSnapshot | null {
  if (!params.primary) {
    return params.fallback;
  }
  if (!params.fallback) {
    return params.primary;
  }
  const fallbackCampaigns = new Map(params.fallback.campaigns.map((campaign) => [campaign.id, campaign]));
  return {
    ...params.primary,
    competitors:
      params.primary.competitors && params.primary.competitors.length > 0
        ? params.primary.competitors
        : params.fallback.competitors,
    notes: [...new Set([...(params.primary.notes ?? []), ...(params.fallback.notes ?? [])])],
    campaigns: params.primary.campaigns.map((campaign) =>
      mergeCampaignMetadata(campaign, fallbackCampaigns.get(campaign.id)),
    ),
  };
}

export async function updateMetaCampaignBudget(params: {
  config: AdsManagerPluginConfig;
  campaignId: string;
  budgetKind: CampaignBudgetKind;
  budget: number;
}): Promise<void> {
  const accessToken = resolveMetaSecret(
    params.config.meta.accessToken,
    params.config.meta.accessTokenEnvVar,
  );
  if (!accessToken) {
    throw new Error("Meta access token is not configured.");
  }
  const fieldName = params.budgetKind === "lifetime" ? "lifetime_budget" : "daily_budget";
  await requestGraphJson<{ success?: boolean }>({
    config: params.config,
    accessToken,
    pathOrUrl: `/${params.campaignId}`,
    method: "POST",
    body: {
      [fieldName]: String(Math.max(0, Math.round(params.budget))),
    },
  });
}

export function resolveProposalAction(proposal: DerivedProposal): string {
  return proposal.id.split("_")[0] ?? proposal.id;
}

export async function applyMetaProposalAction(params: {
  config: AdsManagerPluginConfig;
  snapshot: AdsSnapshot | null;
  proposal: DerivedProposal;
}): Promise<string> {
  if (params.config.safeMode) {
    return "Safe mode is enabled, so approval stayed internal-only.";
  }
  if (!params.config.execution.enableMetaWrites) {
    return "Live Meta execution is disabled, so approval stayed internal-only.";
  }
  if (!params.config.meta.enabled) {
    return "Meta live connector is disabled, so approval stayed internal-only.";
  }
  if (!params.proposal.campaignId) {
    return "Proposal has no linked campaign, so there was no live action to execute.";
  }

  const campaign = params.snapshot?.campaigns.find((entry) => entry.id === params.proposal.campaignId);
  if (!campaign) {
    return `Campaign ${params.proposal.campaignId} was not found in the latest snapshot.`;
  }

  const action = resolveProposalAction(params.proposal);
  if (action !== "tangngansach" && action !== "giamngansach") {
    return `No live executor is implemented yet for proposal type "${action}".`;
  }
  if (!campaign.budgetKind || !campaign.budget || campaign.budget <= 0) {
    return `Campaign ${campaign.name} does not expose a writable ${action} budget in the current snapshot.`;
  }

  const multiplier =
    action === "tangngansach"
      ? params.config.execution.scaleUpMultiplier
      : params.config.execution.scaleDownMultiplier;
  const nextBudget = Math.max(
    params.config.execution.minimumBudget,
    Math.round(campaign.budget * multiplier),
  );
  if (nextBudget === campaign.budget) {
    return `Campaign ${campaign.name} already matches the computed target budget.`;
  }

  await updateMetaCampaignBudget({
    config: params.config,
    campaignId: campaign.id,
    budgetKind: campaign.budgetKind,
    budget: nextBudget,
  });
  return `${campaign.name}: applied live ${campaign.budgetKind} budget update ${campaign.budget} -> ${nextBudget}.`;
}

export async function fetchBreakdownInsights(params: {
  config: AdsManagerPluginConfig;
  logger: Logger;
  campaignIds: string[];
  breakdown: "region" | "hourly_stats_aggregated_by_advertiser_time_zone";
}): Promise<Record<string, Record<string, any>>> {
  const accessToken = resolveMetaSecret(
    params.config.meta.accessToken,
    params.config.meta.accessTokenEnvVar,
  );
  if (!accessToken) {
    throw new Error("Meta access token is not configured.");
  }

  const results: Record<string, Record<string, any>> = {};

  // Chia nhỏ campaignIds thành các mẻ (batch) để tránh URL quá dài
  const chunkSize = 25;
  for (let i = 0; i < params.campaignIds.length; i += chunkSize) {
    const chunk = params.campaignIds.slice(i, i + chunkSize);
    const filter = JSON.stringify([{ field: "campaign.id", operator: "IN", value: chunk }]);
    const url = `${normalizeMetaAccountId(params.config.meta.adAccountId ?? "")}/insights?level=campaign&breakdowns=${params.breakdown}&filtering=${encodeURIComponent(filter)}&date_preset=${params.config.meta.insightsDatePreset}&fields=campaign_id,spend,actions,cost_per_action_type,purchase_roas&limit=1000`;

    const data = await requestGraphJson<{ data: any[] }>({
      config: params.config,
      accessToken,
      pathOrUrl: url,
      method: "GET"
    });

    for (const row of (data.data || [])) {
      const cId = readString(row.campaign_id);
      if (!cId) continue;
      
      const key = readString(row[params.breakdown === "region" ? "region" : "hourly_stats_aggregated_by_advertiser_time_zone"]) || "unknown";
      
      if (!results[cId]) results[cId] = {};
      results[cId][key] = {
        spend: readNumber(row.spend) || 0,
        cpa: extractPurchaseCpa(row),
        roas: extractPurchaseRoas(row),
        conversions: sumMatchingActionValues(row.actions, isPurchaseActionType) || 0
      };
    }
  }

  return results;
}
