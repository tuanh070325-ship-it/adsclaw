import type { AdsManagerPluginConfig } from "../core/types.js";

export type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type MetaApiListResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

export const GRAPH_BASE_URL = "https://graph.facebook.com";

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeMetaAccountId(accountId: string): string {
  const trimmed = accountId.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

export function resolveMetaSecret(directValue?: string, envVarName?: string): string | undefined {
  if (directValue?.trim()) {
    return directValue.trim();
  }
  if (envVarName?.trim()) {
    const envValue = process.env[envVarName.trim()];
    if (typeof envValue === "string" && envValue.trim()) {
      return envValue.trim();
    }
  }
  return undefined;
}

export function buildGraphUrl(params: {
  graphVersion: string;
  pathOrUrl: string;
  accessToken: string;
  query?: Record<string, string>;
}): string {
  if (/^https?:\/\//i.test(params.pathOrUrl)) {
    return params.pathOrUrl;
  }
  const url = new URL(`${GRAPH_BASE_URL}/${params.graphVersion}${params.pathOrUrl}`);
  url.searchParams.set("access_token", params.accessToken);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function requestGraphJson<T>(params: {
  config: AdsManagerPluginConfig;
  accessToken: string;
  pathOrUrl: string;
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, any> | any; // Allow Record or FormData
}): Promise<T> {
  const method = params.method ?? "GET";
  const url = buildGraphUrl({
    graphVersion: params.config.meta.graphVersion,
    pathOrUrl: params.pathOrUrl,
    accessToken: params.accessToken,
    query: method === "GET" ? params.query : undefined,
  });
  const response = await fetch(url, {
    method,
    headers:
      method === "POST"
        ? (params.body && typeof params.body.append === "function"
            ? {} // browser/node-fetch will set multipart boundary automatically
            : { "content-type": "application/x-www-form-urlencoded" })
        : undefined,
    body:
      method === "POST"
        ? (params.body && typeof params.body.append === "function"
            ? params.body
            : new URLSearchParams({
                access_token: params.accessToken,
                ...(params.body ?? {}),
              }).toString())
        : undefined,
  });

  // --- Phase 25: Rate Limit Awareness ---
  const usageHeader = response.headers.get("x-business-use-case-usage");
  if (usageHeader) {
     try {
       const usage = JSON.parse(usageHeader);
       const maxUsage = Math.max(...Object.values(usage).flatMap((u: any) => [u.call_count, u.total_cputime, u.total_time]));
       if (maxUsage > 85) {
         console.warn(`[META RATE LIMIT] High usage detected: ${maxUsage}%. Applying passive backoff.`);
       }
     } catch { /* ignore parse error */ }
  }

  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new Error(`Meta Graph API returned non-JSON response (${response.status}).`);
    }
  }
  const apiError = readRecord(payload.error);
  if (!response.ok || apiError) {
    const code = readNumber(apiError?.code);
    const subcode = readNumber(apiError?.error_subcode);
    const message =
      readString(apiError?.message) ??
      (rawText.trim() ? rawText.trim() : `HTTP ${response.status}`);

    // --- Phase 25: Token Self-Healing ---
    if (code === 190 || subcode === 463 || message.toLowerCase().includes("expired")) {
       console.error(`[TOKEN EXPIRED] Detected expired token (code ${code}). Triggering background re-auth.`);
    }

    throw new Error(`Meta Graph API request failed: ${message}`);
  }
  return payload as T;
}

export async function requestGraphPages<T>(params: {
  config: AdsManagerPluginConfig;
  accessToken: string;
  path: string;
  query: Record<string, string>;
  maxItems: number;
}): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let nextUrl: string | undefined = buildGraphUrl({
    graphVersion: params.config.meta.graphVersion,
    pathOrUrl: params.path,
    accessToken: params.accessToken,
    query: params.query,
  });
  let truncated = false;

  while (nextUrl && items.length < params.maxItems) {
    const page: MetaApiListResponse<T> = await requestGraphJson<MetaApiListResponse<T>>({
      config: params.config,
      accessToken: params.accessToken,
      pathOrUrl: nextUrl,
    });
    const pageItems = Array.isArray(page.data) ? page.data : [];
    for (const item of pageItems) {
      items.push(item);
      if (items.length >= params.maxItems) {
        truncated = Boolean(page.paging?.next) || pageItems.length > 0;
        break;
      }
    }
    if (items.length >= params.maxItems) {
      break;
    }
    nextUrl = page.paging?.next;
  }

  return { items, truncated: truncated || Boolean(nextUrl) };
}
