export type HttpFetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
  rawText: string;
  error?: string;
};

export type HttpFetchParams = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export type AdLibraryResult = {
  id: string;
  adText: string;
  status: string;
  adCreationTime?: string;
  startDate?: string;
  endDate?: string;
  snapshotUrl?: string;
  impressions?: unknown;
  platforms?: string[];
  pageName?: string;
  pageId?: string;
  linkTitles?: string[];
  imageUrl?: string;
  videoUrl?: string;
  ctaType?: string;
  libraryUrl?: string;
  spend?: { lower_bound: string; upper_bound: string };
  fundingEntity?: string;
  demographics?: any[];
  regions?: any[];
  _runDays?: number;
  isWinner?: boolean;
  budgetEstimate?: string;
  ocrText?: string;
};

export type MetaAccountData = {
  accountId: string;
  accountName: string;
  amountSpent: number;
  spendCap: number;
  balance: number;
  currency: string;
  campaigns: MetaCampaignData[];
};

export type MetaCampaignData = {
  id: string;
  name: string;
  status: string;
  dailyBudget: number;
  lifetimeBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  healthScore: number;
  healthGrade: "A" | "B" | "C" | "D" | "F";
  fatigued: boolean;
};
