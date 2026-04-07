/**
 * fpt-ai-service.ts — FPT AI Marketplace Integration
 * ────────────────────────────────────────────────────
 * OpenAI-compatible API at https://mkp-api.fptcloud.com
 * Supports all 26 models from the FPT AI Marketplace account.
 * Uses native fetch() — no external SDK required.
 */

// ─── Model IDs (exact from FPT API Key permissions) ──────────────────────────

export type FptModelId =
  // LLM Chat Models
  | "Qwen3-32B"
  | "Kimi-K2.5"
  | "GLM-4.7"
  | "gemma-4-31B-it"
  | "gemma-4-26B-A4B-it"
  | "gemma-3-27b-it"
  | "gpt-oss-120b"
  | "Llama-3.3-70B-Instruct"
  | "Llama-3.3-Swallow-70B-Instruct-v0.4"
  | "Alpamayo-R1-10B"
  | "SaoLa-Llama3.1-planner"
  | "SaoLa3.1-medium"
  | "DeepSeek-V3.2-Speciate"
  | "Nemotron-3-Super-120B-A12B"
  // Code Model
  | "Qwen2.5-Coder-32B-Instruct"
  // Vision Models
  | "Qwen2.5-VL-7B-Instruct"
  | "Qwen3-VL-8B-Instruct"
  // Document / OCR
  | "FPT.AI-KIE-v1.7"
  | "DeepSeek-OCR"
  // Speech-to-Text
  | "FPT.AI-whisper-large-v3-turbo"
  | "FPT.AI-whisper-medium"
  | "whisper-large-v3-turbo"
  // Text-to-Speech
  | "FPT.AI-VITs"
  // Embeddings
  | "Vietnamese_Embedding"
  | "multilingual-e5-large"
  // Reranking
  | "bge-reranker-v2-m3";

// ─── Task Types ──────────────────────────────────────────────────────────────

export type TaskType =
  | "chat"
  | "expert_consult"
  | "content_gen"
  | "data_analysis"
  | "quick_reply"
  | "heavy_reasoning"
  | "planning"
  | "vietnamese_nlp"
  | "creative_vision"
  | "voice_to_text"
  | "text_to_voice"
  | "ocr"
  | "doc_extraction"
  | "semantic_search"
  | "reranking"
  | "code_gen"
  | "multilingual";

// ─── Config ──────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.FPT_AI_BASE_URL || "https://mkp-api.fptcloud.com";
}

function getApiKey(): string | undefined {
  return process.env.FPT_AI_API_KEY;
}

function getDefaultModel(): FptModelId {
  return (process.env.FPT_AI_DEFAULT_MODEL as FptModelId) || "Qwen3-32B";
}

// ─── Task-to-Model Map ──────────────────────────────────────────────────────

const TASK_MODEL_MAP: Record<TaskType, { primary: FptModelId; fallback: FptModelId }> = {
  chat:             { primary: "Kimi-K2.5",                    fallback: "SaoLa3.1-medium" },
  expert_consult:   { primary: "Kimi-K2.5",                    fallback: "gpt-oss-120b" },
  content_gen:      { primary: "gemma-4-31B-it",               fallback: "gemma-4-26B-A4B-it" },
  data_analysis:    { primary: "Qwen2.5-Coder-32B-Instruct",   fallback: "GLM-4.7" },
  quick_reply:      { primary: "Alpamayo-R1-10B",              fallback: "gemma-4-26B-A4B-it" },
  heavy_reasoning:  { primary: "gpt-oss-120b",                 fallback: "Nemotron-3-Super-120B-A12B" },
  planning:         { primary: "SaoLa-Llama3.1-planner",       fallback: "Qwen3-32B" },
  vietnamese_nlp:   { primary: "SaoLa3.1-medium",              fallback: "Qwen3-32B" },
  creative_vision:  { primary: "Qwen2.5-VL-7B-Instruct",      fallback: "Qwen3-VL-8B-Instruct" },
  voice_to_text:    { primary: "FPT.AI-whisper-large-v3-turbo", fallback: "FPT.AI-whisper-medium" },
  text_to_voice:    { primary: "FPT.AI-VITs",                  fallback: "FPT.AI-VITs" },
  ocr:              { primary: "DeepSeek-OCR",                 fallback: "FPT.AI-KIE-v1.7" },
  doc_extraction:   { primary: "FPT.AI-KIE-v1.7",             fallback: "DeepSeek-OCR" },
  semantic_search:  { primary: "Vietnamese_Embedding",         fallback: "multilingual-e5-large" },
  reranking:        { primary: "bge-reranker-v2-m3",           fallback: "bge-reranker-v2-m3" },
  code_gen:         { primary: "Qwen2.5-Coder-32B-Instruct",   fallback: "DeepSeek-V3.2-Speciate" },
  multilingual:     { primary: "Llama-3.3-Swallow-70B-Instruct-v0.4", fallback: "Llama-3.3-70B-Instruct" },
};

/**
 * Select the best model for a given task type.
 */
export function selectModel(task: TaskType): FptModelId {
  return TASK_MODEL_MAP[task]?.primary ?? getDefaultModel();
}

/**
 * Get the fallback model for a given task type.
 */
export function selectFallbackModel(task: TaskType): FptModelId {
  return TASK_MODEL_MAP[task]?.fallback ?? "Qwen3-32B";
}

// ─── Chat Completions ────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
};

export type ChatCompletionTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
};

export type ChatCompletionToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export type ChatCompletionParams = {
  model?: FptModelId;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ChatCompletionTool[];
  toolChoice?: ChatCompletionToolChoice;
};

export type ChatCompletionResult = {
  content: string | null;
  tool_calls?: ChatMessage["tool_calls"];
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

/**
 * Multi-layer cleaner to strip raw internal tags (Kimi, Qwen, GLM)
 * and tool-calling blocks from content before returning to user.
 */
export function cleanFptContent(text: string | null): string | null {
  if (!text) return null;
  
  // 1. Strip <|...|> tags common in FPT Marketplace models
  let cleaned = text.replace(/<\|[\w\s_.:|]+\|>/g, "").trim();

  // 2. Strip raw tool call sections if they leaked into content
  // Pattern: functions.tool_name:index or functions.actor_name:index
  cleaned = cleaned.replace(/functions\.\w+:\d+/g, "").trim();

  // 3. Strip internal [THOUGHT] or <|thought|> blocks if present
  cleaned = cleaned.replace(/\[THOUGHT\].*?\[\/THOUGHT\]/gis, "");
  cleaned = cleaned.replace(/<\|thought\|>.*?<\|thought\|>/gis, "");

  // 4. Cleanup trailing/leading artifacts from stripped blocks
  cleaned = cleaned.replace(/^\s*\{\s*\}/g, "").trim(); // Empty JSON artifacts
  
  return cleaned || null;
}

/**
 * Call FPT AI chat completions endpoint (OpenAI-compatible).
 * Returns ChatCompletionResult containing content and/or tool_calls.
 */
export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("FPT_AI_API_KEY not configured");
  }

  const model = params.model ?? getDefaultModel();
  const baseUrl = getBaseUrl();

  const endpoint = baseUrl.endsWith("/v1") 
    ? `${baseUrl}/chat/completions` 
    : `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  console.log(`\n[FPT API 🚀] Gọi endpoint: ${endpoint} | Model: ${model}`);
  if (params.tools) {
    console.log(`[FPT API 🚀] Tool Gọi được cung cấp: ${params.tools.length} công cụ`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 500,
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false,
      tools: params.tools,
      tool_choice: params.toolChoice,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`FPT AI API error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: ChatMessage["tool_calls"];
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error(`FPT AI returned empty choices (model: ${model})`);
  }

  return {
    content: cleanFptContent(message.content ?? null),
    tool_calls: message.tool_calls,
    model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens ?? 0,
      completionTokens: data.usage.completion_tokens ?? 0,
      totalTokens: data.usage.total_tokens ?? 0,
    } : undefined,
  };
}

/**
 * Chat completion with automatic fallback to a backup model.
 */
export async function chatCompletionWithFallback(
  params: ChatCompletionParams,
  task: TaskType,
): Promise<ChatCompletionResult> {
  const primary = params.model ?? selectModel(task);
  const fallback = selectFallbackModel(task);

  console.log(`[FPT Fallback Manager] Task: ${task} | Chính: ${primary} | Dự phòng: ${fallback}`);

  // Attempt primary model
  try {
    return await chatCompletion({ ...params, model: primary });
  } catch (primaryErr: unknown) {
    const errMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    // If primary failed & fallback is different, try fallback
    if (fallback !== primary) {
      try {
        return await chatCompletion({ ...params, model: fallback });
      } catch {
        // Both failed
      }
    }
    throw new Error(`FPT AI both models failed (${primary}, ${fallback}): ${errMsg}`);
  }
}

// ─── Embeddings ──────────────────────────────────────────────────────────────

export type EmbeddingParams = {
  model?: FptModelId;
  input: string | string[];
};

/**
 * Create embeddings using FPT AI Vietnamese_Embedding or multilingual-e5-large.
 */
export async function createEmbedding(params: EmbeddingParams): Promise<number[][]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("FPT_AI_API_KEY not configured");
  }

  const model = params.model ?? selectModel("semantic_search");
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: params.input,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`FPT AI Embedding error (${response.status}): ${errorText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    data?: Array<{ embedding?: number[] }>;
  };

  return (data.data ?? []).map((d) => d.embedding ?? []);
}

// ─── Health Check ────────────────────────────────────────────────────────────

export type FptHealthResult = {
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
};

/**
 * Quick health check — sends a minimal chat request to verify connectivity.
 */
export async function checkFptHealth(): Promise<FptHealthResult> {
  const model = "Alpamayo-R1-10B"; // Lightest model for health check
  const start = Date.now();

  try {
    const content = await chatCompletion({
      model,
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
      temperature: 0,
    });

    return {
      ok: !!content,
      model,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      model,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Model Info Helpers ──────────────────────────────────────────────────────

/**
 * Get all available model IDs.
 */
export function getAllModelIds(): FptModelId[] {
  return [
    "Qwen3-32B", "Kimi-K2.5", "GLM-4.7",
    "gemma-4-31B-it", "gemma-4-26B-A4B-it", "gemma-3-27b-it",
    "gpt-oss-120b", "Llama-3.3-70B-Instruct",
    "Llama-3.3-Swallow-70B-Instruct-v0.4",
    "Alpamayo-R1-10B", "SaoLa-Llama3.1-planner", "SaoLa3.1-medium",
    "DeepSeek-V3.2-Speciate", "Nemotron-3-Super-120B-A12B",
    "Qwen2.5-Coder-32B-Instruct",
    "Qwen2.5-VL-7B-Instruct", "Qwen3-VL-8B-Instruct",
    "FPT.AI-KIE-v1.7", "DeepSeek-OCR",
    "FPT.AI-whisper-large-v3-turbo", "FPT.AI-whisper-medium", "whisper-large-v3-turbo",
    "FPT.AI-VITs",
    "Vietnamese_Embedding", "multilingual-e5-large",
    "bge-reranker-v2-m3",
  ];
}

/**
 * Check if FPT AI is configured (API key is present).
 */
export function isFptConfigured(): boolean {
  return !!getApiKey();
}
