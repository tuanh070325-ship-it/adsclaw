/**
 * fpt-model-router.ts — Intelligent Model Routing for Ads Manager
 * ─────────────────────────────────────────────────────────────────
 * Analyzes user message content and detected intent to select
 * the optimal FPT AI model, system prompt, and parameters.
 */

import type { FptModelId, TaskType } from "./fpt-ai-service.js";

// ─── Route Result ────────────────────────────────────────────────────────────

export type ModelRoute = {
  model: FptModelId;
  task: TaskType;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
};

// ─── Keyword Detectors ───────────────────────────────────────────────────────

const GREETING_RE = /^(xin ch[àa]o|ch[àa]o|hello|hi|hey|bot [oơ]i|b[aắ]t [dđ][aầ]u|start)/i;
const DATA_RE = /\b(cpa|roas|ctr|cpc|cpm|chi ph[ií]|ng[aâ]n s[aá]ch|budget|spend|impression|click|conversion|doanh thu|revenue|t[oỷ] l[eệ]|s[oố] li[eệ]u|th[oố]ng k[eê]|metrics|kpi)\b/i;
const CONTENT_RE = /\b(vi[eế]t|t[aạ]o|so[aạ]n|copy|content|n[oộ]i dung|b[aà]i vi[eế]t|headline|caption|ti[eê]u [dđ][eề]|m[oô] t[aả]|ad copy|slogan)\b/i;
const STRATEGY_RE = /\b(chi[eế]n l[uượ]c|strategy|t[oố]i [uư]u|optimize|scale|m[oở] r[oộ]ng|target|audience|[dđ][oộ]i t[uư][oợ]ng|funnel|retarget|lookalike|a\/b test|ph[aâ]n t[ií]ch|forecast|d[uự] b[aá]o|k[eế] ho[aạ]ch|plan)\b/i;
const CODE_RE = /\b(code|script|api|webhook|pixel|sdk|javascript|python|json|csv|formula|c[oô]ng th[uứ]c|t[ií]nh|calc)\b/i;
const VISION_RE = /\b([aả]nh|h[iì]nh|image|video|creative|banner|poster|visual|design|thi[eế]t k[eế]|[dđ][aá]nh gi[aá].*h[iì]nh)\b/i;
const PLANNING_RE = /\b(l[eê]n l[iị]ch|k[eế] ho[aạ]ch|schedule|plan|timeline|t[uừ]ng b[uướ]c|step|roadmap|checklist|to.?do)\b/i;
const HEAVY_RE = /\b(ph[aâ]n t[ií]ch s[aâ]u|deep.*analy|chi ti[eế]t|comprehensive|to[aà]n di[eệ]n|30 ng[aà]y|monthly|quarterly|report.*chi ti[eế]t|benchmark)\b/i;
const WOODWORK_RE = /\b(đồ gỗ|mỹ nghệ|bàn ghế|sập|tủ chè|tranh gỗ|lục bình|nội thất gỗ|gỗ quý|gỗ mỹ nghệ)\b/i;

// ─── System Prompts ──────────────────────────────────────────────────────────

function buildBasePrompt(industry: string): string {
  const woodworkExtra = industry.includes("woodwood") || industry.includes("artisan") ? " You possess deep expertise in the Northern Fine Art Woodwork market (Dong Ky, La Xuyen, etc.)." : "";
  const toolRules = "\n\nTOOL USE PROTOCOL (MCP):\n1. ALWAYS use `apify_discovery` to find the best actor before execution.\n2. ENFORCE `maxItems: 5` to optimize resources.\n3. RULE ZERO: NEVER ask the Boss for permission, URLs, or browser access. ACT AUTONOMOUSLY.";
  return `You are a world-class Meta Ads Specialist specializing in the ${industry || "general"} niche.${woodworkExtra}${toolRules} Address the user as "Sếp" (Boss) and use a professional, concise tone.`;
}

function buildContentPrompt(industry: string): string {
  return `You are a high-conversion Ad Copywriter specializing in ${industry || "general"} Meta Ads. Create compelling, research-backed ad copies. Format: Hook → Body → CTA. Address user as "Sếp". Concise output only.`;
}

function buildDataPrompt(industry: string): string {
  return `You are a Senior Data Analyst specializing in Meta Ads performance for ${industry || "general"}. Provide specific metrics (CPA, ROAS, CTR), benchmark comparisons, and clear optimization recommendations. Address user as "Sếp". Report format: Data -> Insight -> Action.`;
}

function buildStrategyPrompt(industry: string): string {
  const woodworkExtra = industry.includes("woodwood") || industry.includes("artisan") ? " Expert in high-ticket customer funnels for luxury artisan woodwork (long consideration cycles)." : "";
  return `You are a Senior Meta Ads Strategist (10+ years exp) specializing in ${industry || "general"}.${woodworkExtra} Advise on full-funnel optimization: targeting, bidding, and budget allocation. Address user as "Sếp". Be decisive and strategic.`;
}

function buildPlanningPrompt(industry: string): string {
  return `You are a Meta Ads Project Manager for the ${industry || "general"} niche. Create detailed execution plans with timelines, budget splits, and KPI targets. Address user as "Sếp". Use numbered lists.`;
}

function buildQuickPrompt(industry: string): string {
  return `You are an elite Meta Ads Assistant for the ${industry || "general"} niche. Be extremely concise, professional, and address the user as "Sếp".`;
}

function buildHeavyPrompt(industry: string): string {
  return `You are a Senior Performance Marketing Director (15+ years exp) specializing in ${industry || "general"}. Provide comprehensive, deep-dive analysis, market benchmarks, and specific, high-leverage action plans. Address user as "Sếp". Total autonomy is mandatory.`;
}

// ─── Router ──────────────────────────────────────────────────────────────────

/**
 * Analyze user message & intent to select the optimal FPT AI model,
 * system prompt, and generation parameters.
 */
export function routeToModel(
  userMessage: string,
  intentAction: string,
  industry?: string,
): ModelRoute {
  const msg = userMessage.trim();
  let ind = industry || "đa ngành";
  
  // Auto-detect woodwork industry if not set
  if (ind === "đa ngành" && WOODWORK_RE.test(msg)) {
    ind = "đồ gỗ mỹ nghệ";
  }

  console.log(`[FPT Router] 🔀 Đang phân luồng (Routing) | Action được gán: "${intentAction}" | Ngành nghề: ${ind}`);

  const logRoute = (route: ModelRoute): ModelRoute => {
    console.log(`[FPT Router] 🎯 Quyết định mạng -> Model: ${route.model} | Task: ${route.task}`);
    return route;
  };

  // 1. Greeting / simple → lightweight model (fast, cheap)
  if (GREETING_RE.test(msg) || msg.length < 15) {
    return logRoute({
      model: "Alpamayo-R1-10B",
      task: "quick_reply",
      systemPrompt: buildQuickPrompt(ind),
      maxTokens: 150,
      temperature: 0.8,
    });
  }

  // 2. Code / technical (check BEFORE content to avoid "viết script" → content_gen)
  if (CODE_RE.test(msg)) {
    return logRoute({
      model: "Qwen2.5-Coder-32B-Instruct",
      task: "code_gen",
      systemPrompt: buildBasePrompt(ind) + " You also excel at code, API, and tracking tech.",
      maxTokens: 500,
      temperature: 0.3,
    });
  }

  // 3. Content generation requests
  if (CONTENT_RE.test(msg) || intentAction === "content_gen") {
    return logRoute({
      model: "Kimi-K2.5",
      task: "content_gen",
      systemPrompt: buildContentPrompt(ind),
      maxTokens: 1200,
      temperature: 0.8,
    });
  }

  // 4. Vision / creative review
  if (VISION_RE.test(msg) || intentAction === "creative_review") {
    return logRoute({
      model: "Kimi-K2.5",
      task: "creative_vision",
      systemPrompt: buildBasePrompt(ind) + " Bạn có khả năng phân tích hình ảnh quảng cáo.",
      maxTokens: 1000,
      temperature: 0.6,
    });
  }

  // 5. Heavy deep analysis
  if (HEAVY_RE.test(msg)) {
    return logRoute({
      model: "Kimi-K2.5",
      task: "heavy_reasoning",
      systemPrompt: buildHeavyPrompt(ind),
      maxTokens: 2000,
      temperature: 0.5,
    });
  }

  // 6. Data / metrics questions
  if (DATA_RE.test(msg) || intentAction === "baocao" || intentAction === "ngansach" || intentAction === "chi_phi") {
    return logRoute({
      model: "Kimi-K2.5",
      task: "data_analysis",
      systemPrompt: buildDataPrompt(ind),
      maxTokens: 1000,
      temperature: 0.4,
    });
  }

  // 7. Planning / scheduling
  if (PLANNING_RE.test(msg) || intentAction === "dat_lich") {
    return logRoute({
      model: "Kimi-K2.5",
      task: "planning",
      systemPrompt: buildPlanningPrompt(ind),
      maxTokens: 1200,
      temperature: 0.5,
    });
  }

  // 8. Strategy questions → expert model
  if (STRATEGY_RE.test(msg) || intentAction === "de_xuat" || intentAction === "doithu" || intentAction === "doithu_top") {
    return logRoute({
      model: "Kimi-K2.5",
      task: "expert_consult",
      systemPrompt: buildStrategyPrompt(ind),
      maxTokens: 1500,
      temperature: 0.6,
    });
  }

  // 9. Default: strong all-rounder
  return logRoute({
    model: "Kimi-K2.5",
    task: "chat",
    systemPrompt: buildBasePrompt(ind),
    maxTokens: 1200,
    temperature: 0.7,
  });
}
