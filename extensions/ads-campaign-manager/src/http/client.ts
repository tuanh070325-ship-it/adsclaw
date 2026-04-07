import type { HttpFetchParams, HttpFetchResult, MetaCampaignData } from "./types.js";

export function safeStr(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val);
  return (s === "undefined" || s === "null" || s === "") ? undefined : s;
}

export function calcHealthScore(c: Partial<MetaCampaignData> & { spend: number }): {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
} {
  if (c.spend < 300000) return { score: 50, grade: "C" };

  const roas = c.roas ?? 0;
  const ctr = c.ctr ?? 0;
  const cpa = c.cpa ?? 0;
  const pacing = (c.dailyBudget ?? 0) > 0 ? c.spend / (c.dailyBudget ?? 1) : 0.8;
  const learning = c.status === "active" ? 1 : 0;

  const roasScore = roas >= 2.6 ? 100 : roas >= 2.0 ? 80 : roas >= 1.5 ? 60 : roas >= 1.0 ? 30 : 0;
  const ctrScore = ctr >= 2.0 ? 100 : ctr >= 1.5 ? 80 : ctr >= 1.2 ? 60 : ctr >= 0.8 ? 30 : 0;
  const cpaScore = cpa === 0 ? 50 : cpa < 100000 ? 100 : cpa < 150000 ? 80 : cpa < 250000 ? 60 : cpa < 350000 ? 30 : 0;
  const pacingScore = pacing >= 0.8 && pacing <= 1.0 ? 100 : pacing >= 0.6 ? 70 : pacing > 1.15 ? 0 : 40;
  const learningScore = learning === 1 ? 100 : 0;

  const score = Math.round(
    roasScore * 0.30 + ctrScore * 0.20 + cpaScore * 0.20 + pacingScore * 0.15 + learningScore * 0.15
  );
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade };
}

export async function httpFetch(params: HttpFetchParams & { retries?: number }): Promise<HttpFetchResult> {
  const { url, method = "GET", headers = {}, body, timeoutMs = 30000, retries = 3 } = params;
  let attempt = 0;

  while (attempt < retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const opts: RequestInit = {
        method,
        headers: { "User-Agent": "OpenClaw-Bot/1.0", ...headers },
        signal: controller.signal,
      };
      if (body !== undefined) {
        opts.body = typeof body === "string" ? body : JSON.stringify(body);
        if (!headers["Content-Type"] && typeof body !== "string") {
          (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      }
      const res = await fetch(url, opts);
      const rawText = await res.text();
      let data: unknown = rawText;
      try { data = JSON.parse(rawText); } catch { /* ok */ }

      if (res.ok) {
        return { ok: res.ok, status: res.status, statusText: res.statusText, data, rawText };
      }

      if (res.status !== 429 && res.status < 500) {
        return { ok: res.ok, status: res.status, statusText: res.statusText, data, rawText };
      }

      console.warn(`[http-fetch] Attempt ${attempt + 1} failed (${res.status}). Retrying...`);
    } catch (err) {
      if (attempt === retries - 1) {
        return { ok: false, status: 0, statusText: "Network Error", data: null, rawText: "", error: String(err) };
      }
      console.warn(`[http-fetch] Attempt ${attempt + 1} threw error: ${err}. Retrying...`);
    } finally {
      clearTimeout(timer);
      attempt++;
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  return { ok: false, status: 0, statusText: "Retries Exhausted", data: null, rawText: "" };
}

export function resolveApiKey(direct?: string, envVar?: string): string | undefined {
  return direct || (envVar ? process.env[envVar] : undefined);
}
