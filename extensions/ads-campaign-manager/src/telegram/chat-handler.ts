import type { 
  OpenClawPluginApi, 
  // @ts-ignore
  PluginHookMessageReceivedEvent, 
  // @ts-ignore
  PluginHookMessageContext 
} from "openclaw/plugin-sdk/core";
import type { AdsManagerPluginConfig } from "../core/types.js";

// ─── Intent Map ───────────────────────────────────────────────────────────────
//
// Mỗi intent có danh sách pattern keywords (regex) và action tương ứng.
// Ưu tiên theo thứ tự từ trên xuống dưới.

export type IntentAction =
  | "baocao"
  | "tongquan"
  | "canhbao"
  | "ngansach"
  | "doithu_top"
  | "de_xuat"
  | "dongbo"
  | "pheduyet"
  | "tuchoi"
  | "lenh"
  | "cau_hinh"
  | "cai_dat_app"
  | "kiem_tra"
  | "huong_dan"
  | "noi_quy"
  | "accounts"
  | "chon_taikhoan"
  | "inbox"
  | "tra_loi"
  | "bai_viet"
  | "dat_lich"
  | "xoa_bai"
  | "inbox_forward"
  | "chi_phi"
  | "content_gen"
  | "creative_review"
  | "sheets"
  | "price_apify"
  | "unknown";

export type DetectedIntent = {
  action: IntentAction;
  confidence: "high" | "medium" | "low";
  extractedArgs?: string;
  matchedPattern: string;
};

// ─── Intent Patterns ─────────────────────────────────────────────────────────
// ORDER: specific actions first → broad/greedy patterns last
// This prevents broad patterns (baocao, ngansach) from shadowing
// more specific intents (doithu_top, content_gen, tuchoi).

const INTENT_RULES: Array<{
  action: IntentAction;
  patterns: RegExp[];
  confidence: "high" | "medium";
}> = [
  // ── GROUP 1: Intelligence & Research (High Priority) ──
  {
    action: "doithu_top",
    patterns: [
      /\u0111[oố]i th[uủ]/i,
      /competitor/i,
      /qu[eé]t/i,
      /tra c[uứ]u/i,
      /th[uư][oơ]ng hi[eệ]u/i,
      /brand/i,
      /tiktok/i,
      /google/i,
      /search/i,
      /b[aà]i qu[aả]ng c[aá]o.*t[oố]t/i,
      /winning ads/i,
      /b[aà]i n[aà]o hi[eệ]u qu[aả]/i,
      /soi qu[aả]ng c[aá]o/i,
      /analysis/i,
    ],
    confidence: "high",
  },
  {
    action: "content_gen",
    patterns: [
      /vi[eế]t (b[aà]i|content|n[oộ]i dung|qu[aả]ng c[aá]o)/i,
      /t[aạ]o (content|n[oộ]i dung|ad copy)/i,
      /copy ads/i,
      /headline/i,
      /caption/i,
      /vi[eế]t.*cho.*page/i,
    ],
    confidence: "high",
  },

  // ── GROUP 2: Commands & Approvals ──
  {
    action: "pheduyet",
    patterns: [
      /ph[eê] duy[eệ]t/i,
      /ch[aấ]p thu[aậ]n/i,
      /duy[eệ]t\s+(#?\w+)/i,
      /\u0111[oồ]ng [yý]/i,
    ],
    confidence: "medium",
  },
  {
    action: "tuchoi",
    patterns: [
      /t[uừ] ch[oố]i/i,
      /b[oỏ] qua/i,
      /kh[oô]ng duy[eệ]t/i,
    ],
    confidence: "medium",
  },
  {
    action: "lenh",
    patterns: [
      /^(h[aã]y|cho tôi|em [oơ]i|b[aả]o)\s+(t[aắ]t|d[uừ]ng|gi[aả]m|t[aă]ng|b[aậ][tậ])\s+/i,
      /(t[aắ]t|pause|d[uừ]ng).*(camp|chi[ếe]n d[ịi]ch)/i,
      /^(t[a\u0103]ng|scale up) budget/i,
    ],
    confidence: "high",
  },

  // ── GROUP 3: Reporting & Monitoring (Tightened to prevent shadowing) ──
  {
    action: "baocao",
    patterns: [
      /b[aá]o c[aá]o\s+(chi ti[eê]u|h[oô]m nay|k[eế]t qu[aả])/i,
      /chi ti[eê]u bao nhi[eê]u/i,
      /(k[eế]t qu[aả]|hi[eệ]u su[aấ]t).*qu[aả]ng c[aá]o/i,
      /\broas\b/i,
    ],
    confidence: "high",
  },
  {
    action: "ngansach",
    patterns: [
      /ng[aâ]n s[aá]ch/i,
      /budget.*(h[oô]m nay|bao nhi[eê]u|c[oò]n|t[oổ]ng|ph[aâ]n b[oổ])/i,
    ],
    confidence: "high",
  },

  // ── GROUP 4: Functional Features ──
  {
    action: "creative_review",
    patterns: [
      /[dđ][aá]nh gi[aá].*h[iì]nh [aả]nh/i,
      /n[eê]n ch[aạ]y h[iì]nh hay video/i,
      /review.*creative/i,
    ],
    confidence: "high",
  },
  {
    action: "sheets",
    patterns: [
      /xu[aấ]t.*sheet/i,
      /google sheet/i,
      /excel/i,
    ],
    confidence: "high",
  },
  {
    action: "inbox_forward",
    patterns: [
      /forward/i,
      /chuy[eể]n ti[eế]p/i,
    ],
    confidence: "high",
  },
  {
    action: "dongbo",
    patterns: [
      /[dđ][oồ]ng b[oộ]/i,
      /refresh data/i,
      /sync/i,
    ],
    confidence: "high",
  },

  // ── GROUP 5: System & Config ──
  {
    action: "cau_hinh",
    patterns: [/c[aấ]u h[iì]nh/i, /config/i, /setting/i],
    confidence: "high",
  },
  {
    action: "kiem_tra",
    patterns: [/ki[eể]m tra/i, /doctor/i, /bot.*[oổ]n kh[oô]ng/i],
    confidence: "high",
  },
  {
    action: "accounts",
    patterns: [/danh s[aá]ch t[àaá]i kho[aả]n/i, /status accounts/i],
    confidence: "high",
  },
  {
    action: "price_apify",
    patterns: [/b[aả]ng gi[aá] apify/i, /apify balance/i, /^\/?price_apify/i],
    confidence: "high",
  },
];

// ─── Core NLP Detector ────────────────────────────────────────────────────────

export function detectIntent(message: string): DetectedIntent {
  const msg = message.trim();
  console.log(`\n[Bot Processing] 🔍 Intent analysis for: "${msg}"`);

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(msg)) {
        let extractedArgs: string = msg;

        if (rule.action === "cai_dat_app") {
          const idMatch = msg.match(/(\d{10,20})/);
          const secretMatch = msg.match(/([a-f0-9]{32})/);
          if (idMatch && secretMatch) extractedArgs = `${idMatch[1]}|${secretMatch[1]}`;
        } else if (rule.action === "chon_taikhoan") {
          const m = msg.match(/(act_\d+)/i);
          if (m) extractedArgs = m[1];
        } else if (rule.action === "doithu_top") {
          const kw = msg
            .replace(/soi|qu[aả]ng c[aá]o|[dđ][oố]i th[uủ]|h[aả]y|cho em|top|b[àà]i|ng[àa]nh|website|trang/gi, "")
            .trim();
          if (kw.length > 2) extractedArgs = kw;
        }

        console.log(`[Bot Processing] ✅ Intent detected: "${rule.action}" | 추출: "${extractedArgs}" | Pattern: ${pattern.toString()}`);
        return {
          action: rule.action,
          confidence: rule.confidence,
          extractedArgs,
          matchedPattern: pattern.toString(),
        };
      }
    }
  }

  console.log(`[Bot Processing] ⚠️ No specific intent matched, falling back to LLM.`);
  return {
    action: "unknown",
    confidence: "low",
    extractedArgs: msg,
    matchedPattern: "none",
  };
}

// ─── Response Templates ──────────────────────────────────────────────────────

export function buildConfusedResponse(message: string): string {
  return [
    "Dạ Sếp ơi, em chưa rõ ý Sếp. Sếp muốn nghiệp vụ gì ạ? 😅",
    "",
    "Sếp có thể thử:",
    "• \"Phân tích đối thủ TikTok/FB\"",
    "• \"Báo cáo hiệu suất hôm nay\"",
    "• \"Viết content quảng cáo\"",
    "",
    "Sếp nhắn tin tự nhiên, em sẽ đáp ứng ngay ạ.",
  ].join("\n");
}

export function buildGreetingResponse(ownerName?: string): string {
  const name = ownerName ?? "Sếp";
  return [
    `Chào ${name}! 🤖`,
    "",
    "Em là Trợ lý Chuyên gia Meta Ads của Sếp. Em sẵn sàng phân tích đối thủ và tối ưu chiến dịch cho Sếp.",
    "",
    "• Báo cáo hiệu suất → \"báo cáo hnay\"",
    "• Phân tích đối thủ → \"soi quảng cáo skincare\"",
  ].join("\n");
}

export function buildRoutingAck(intent: DetectedIntent): string {
  const ackMap: Record<IntentAction, string> = {
    doithu_top: "Analyzing competitor intelligence... 🔍",
    baocao: "Generating performance report... 📊",
    content_gen: "Drafting high-conversion ad content... ✍️",
    tongquan: "Analyzing account health overview... 🏥",
    canhbao: "Checking for active campaign alerts... ⚠️",
    ngansach: "Analyzing budget allocation... 💰",
    de_xuat: "Fetching AI optimization proposals... 💡",
    dongbo: "Synchronizing latest campaign data... 🔄",
    pheduyet: "Processing approval request... ✅",
    tuchoi: "Processing rejection request... ❌",
    lenh: "Executing command... ⚙️",
    cau_hinh: "Accessing system configuration...",
    kiem_tra: "Running system diagnostics...",
    huong_dan: "Opening operational guide...",
    noi_quy: "Accessing operational guidelines...",
    accounts: "Retrieving account list...",
    chon_taikhoan: "Configuring default account...",
    cai_dat_app: "Registering Meta App credentials...",
    inbox: "Retrieving latest messenger activity...",
    tra_loi: "Drafting response to customer...",
    bai_viet: "Retrieving recent posts...",
    dat_lich: "Accessing scheduling assistant...",
    xoa_bai: "Preparing post for deletion...",
    inbox_forward: "Configuring message forwarding...",
    chi_phi: "Calculating resource consumption... 💰",
    creative_review: "Analyzing creative assets... 🎨",
    sheets: "Exporting data to Google Sheets... 📊",
    price_apify: "Verifying Apify quota balance... 💰",
    unknown: "Processing...",
  };
  return ackMap[intent.action] || "";
}

/**
 * Intent Fulfillment (Phase 20+)
 * Chuyển đổi intent đã phát hiện thành hành động thực tế.
 */
export async function fulfillIntent(params: {
  intent: DetectedIntent;
  context: any; // AssistantContext
  api: any; // OpenClawPluginApi
}): Promise<{ text: string; channelData?: any }> {
  const { intent, context, api } = params;
  const { action, extractedArgs } = intent;

  // Import động các UI renderers để tránh vòng lặp dependency
  const UI = await import("../ui/index.js");

  api.logger?.info?.(`[Bot Processing] ⚙️ Executing Action: "${action}"`);

  switch (action) {
    case "tongquan":
      return UI.renderOverview(context);
    case "baocao":
      return UI.renderReport(context);
    case "canhbao":
      return UI.renderAlerts(context);
    case "ngansach":
      return UI.renderBudget(context);
    case "price_apify": {
      try {
        const { getApifyAccountSummary } = await import("../services/apify-api.js");
        const { me, usage } = await getApifyAccountSummary();
        
        const planType = me.plan?.type?.toUpperCase() ?? "FREE";
        const planStatus = me.plan?.status === 'ACTIVE' ? 'Active ✅' : (me.plan?.status ?? 'N/A');
        const expiry = me.subscription?.currentPeriodEnd 
          ? new Date(me.subscription.currentPeriodEnd).toLocaleDateString('en-US')
          : "Unlimited (Free)";

        const computeUnits = usage.serviceUsage?.ACTOR_COMPUTE_UNITS?.quantity ?? 0;
        const datasetItems = usage.serviceUsage?.DATASET_WRITES?.quantity ?? 0;
        const requestQueue = usage.serviceUsage?.REQUEST_QUEUE_WRITES?.quantity ?? 0;

        const text = [
          `📊 **APIFY METRICS - RESOURCE MANAGEMENT**`,
          `──────────────────────`,
          `👤 **Account:** \`${me.username}\` (${planType})`,
          `💳 **Status:** ${planStatus}`,
          `📅 **Expiry:** ${expiry}`,
          ``,
          `🚀 **Consumption (This Month):**`,
          `• **Compute Units:** \`${computeUnits.toFixed(2)}\` CUs`,
          `• **Dataset Items:** \`${datasetItems.toLocaleString()}\` items`,
          `• **Request Queue:** \`${requestQueue.toLocaleString()}\` queries`,
          ``,
          `💡 *Strategic Insight:*`,
          `_Focus scans on top-tier competitors to optimize Compute Unit efficiency._`
        ].join("\n");

        return { text };
      } catch (error: any) {
        return { text: `❌ Apify API Error: ${error.message}` };
      }
    }
    case "doithu_top": {
      // Step 3: Upgraded Agentic Workflow for Intelligent Intelligence
      try {
        const { chatCompletion } = await import("../services/fpt-ai-service.js");
        const { routeToModel } = await import("../services/fpt-model-router.js");
        const { createMcpToolGroup } = await import("../tools/mcp-workflow-tools.js");
        
        const userMsg = extractedArgs || "Analyze top competitor ads for this business.";
        const routing = routeToModel(userMsg, action, context?.config?.business?.industry);
        const mcpTools = createMcpToolGroup(api);
        
        // Convert AnyAgentTool to OpenAI-compatible Tools
        const tools = mcpTools.map(t => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters as any
          }
        }));

        api.logger?.info?.(`[MCP 🤖] Agentic scan starting for: ${userMsg}`);
        
        const result = await chatCompletion({
          model: routing.model,
          messages: [
            { role: "system", content: `${routing.systemPrompt}
--- ELITE ESPIONAGE PROTOCOL ---
YOU ARE A HIGH-LEVEL INTELLIGENCE OPERATIVE. STRICT ADHERENCE IS MANDATORY:
1. TOOLS: Use 'apify_discovery' to find actors and 'apify_facebook_ads' (or detected tools) for execution.
2. RULE ZERO: NEVER ask the Boss for permission, URLs, or browser access. ACT AUTONOMOUSLY.
3. CHAIN OF COMMAND: If requested to "analyze" or "scan", you MUST chain tools immediately (Discovery -> Execution). DO NOT provide a text response until tools have run.
4. TONE: Professional, concise, and data-driven. Report metrics first, then strategy.
5. VIOLATION of autonomy is mission failure. DO NOT ASK. JUST EXECUTE.` },
            { role: "user", content: userMsg },
          ],
          tools,
          toolChoice: "auto"
        });

        // 1. Check for Tool Calls
        if (result.tool_calls && result.tool_calls.length > 0) {
          const toolCall = result.tool_calls[0];
          const tool = mcpTools.find(t => t.name === toolCall.function.name);
          
          if (tool && tool.execute) {
            api.logger?.info?.(`[MCP 🚀] Executing discovered tool: ${tool.name}`);
            const args = JSON.parse(toolCall.function.arguments);
            const toolResult = await tool.execute(toolCall.id, args);
            
            // Final analysis of tool result
            const finalResult = await chatCompletion({
              model: routing.model,
              messages: [
                { role: "system", content: routing.systemPrompt + "\nAnalyze competitor intelligence results for the Boss. Summarize winning ads, creative formats, and tactics. Be extremely concise and professional. Address as 'Sếp'." },
                { role: "user", content: userMsg },
                { role: "assistant", content: null, tool_calls: [toolCall] },
                { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult.content) }
              ]
            });

            return { text: finalResult.content || "Scan complete. No significant insights discovered." };
          }
        }

        return { text: result.content || "No competitive data matched the intelligence criteria." };
      } catch (err: any) {
        api.logger?.error?.(`[MCP ❌] Agentic Workflow error: ${err.message}`);
        return { text: `❌ Intelligence Scanning Error: ${err.message}` };
      }
    }
    case "de_xuat":
      return UI.renderProposals(context);
    case "accounts":
      return UI.renderEnterpriseHealth(context);
    case "dongbo": {
      const { runAssistantSync } = await import("../assistant/index.js");
      await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig: context.config,
      });
      const refreshed = await (await import("../assistant/index.js")).loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig: context.config,
      });
      return UI.renderSyncResult(refreshed);
    }
    case "huong_dan":
      return UI.renderGuide(context);
    case "cau_hinh":
      return UI.renderConfig(context);
    case "kiem_tra":
      return UI.renderConfigCheck(context);
    case "noi_quy":
      return UI.renderRules(context);
    case "pheduyet":
    case "tuchoi": {
      if (!extractedArgs) return { text: "Sếp ơi, Sếp muốn duyệt proposal ID nào ạ? Ví dụ: 'Duyệt #ai_123'" };
      const { setProposalStatus } = await import("../assistant/index.js");
      const status = action === "pheduyet" ? "approved" : "rejected";
      const updated = await setProposalStatus({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig: context.config,
        proposalId: extractedArgs,
        status,
      });
      const proposal = updated.state.proposals.find(p => p.id === extractedArgs);
      if (!proposal) return { text: `Không tìm thấy proposal ${extractedArgs} sau khi cập nhật.` };
      
      return UI.renderApprovalResult({
        context: updated,
        proposal,
        action: status
      });
    }
    case "chon_taikhoan": {
      if (!extractedArgs) return { text: "Sếp ơi, Sếp muốn dùng tài khoản act_ nào ạ? Ví dụ: 'Dùng act_123456'" };
      const { setSelectedPage } = await import("../core/db-state.js");
      await setSelectedPage(context.config, extractedArgs); 
      return { text: `✅ Đã chuyển sang tài khoản: \`${extractedArgs}\`. Sếp ra lệnh tiếp đi ạ!` };
    }
    case "chi_phi": {
      const { getTotalApifyCost } = await import("../http/apify-cost-tracker.js");
      const businessId = Buffer.from(context.config.business.name).toString("base64").slice(0, 64);
      const costs = await getTotalApifyCost(context.config, businessId);
      
      const lines = [
        "📊 **Báo cáo chi phí vận hành Apify**",
        "",
        `• Hôm nay: **$${costs.todayUsd.toFixed(4)}**`,
        `• 30 ngày qua: **$${costs.last30DaysUsd.toFixed(4)}**`,
        `• Tổng cộng: **$${costs.totalUsd.toFixed(4)}**`,
        "",
        "_Chi phí này tính theo usage thực tế của các actor thám báo đối thủ và quét dữ liệu._"
      ];
      return { text: lines.join("\n") };
    }
    case "lenh": {
      if (!extractedArgs) return { text: "Sếp ơi, lệnh của Sếp là gì ạ?" };
      const { appendBossInstruction } = await import("../assistant/index.js");
      const { suggestFollowUp } = await import("../cli/commands/shared.js");
      const { context: newContext, instruction } = await appendBossInstruction({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig: context.config,
        text: extractedArgs,
      });
      const reply = UI.renderInstructionAck({ context: newContext, instruction });
      return { ...reply, text: `${reply.text}\n${suggestFollowUp(extractedArgs)}` };
    }
    case "inbox": {
      return {
        text: [
          "📨 **Inbox Messenger**",
          "",
          "Sếp có thể dùng các lệnh sau để quản lý inbox:",
          "• `/inbox` — Xem tin nhắn mới nhất",
          "• `/inbox_reply <id> <nội dung>` — Trả lời tin nhắn",
          "",
          "_Sếp cần bật Meta webhook để nhận tin nhắn real-time._",
        ].join("\n"),
      };
    }

    case "bai_viet": {
      return {
        text: [
          "📝 **Quản Lý Bài Viết Fanpage**",
          "",
          "Sếp có thể:",
          "• `/post_list` — Xem bài đăng gần đây",
          "• `/post_create <nội dung>` — Đăng bài mới",
          "• `/post_schedule <thời gian> <nội dung>` — Lên lịch đăng",
          "",
          "Hoặc nói: \"Viết content cho page\" để AI soạn giúp Sếp.",
        ].join("\n"),
      };
    }

    case "dat_lich": {
      return {
        text: [
          "🗓️ **Đặt Lịch Đăng Bài**",
          "",
          "Sếp có thể lên lịch đăng bài tự động:",
          "• `/post_schedule 2026-04-07T09:00 <nội dung>` — Đăng vào thời gian chỉ định",
          "• `/post_list scheduled` — Xem bài đã lên lịch",
          "",
          "_Lưu ý: Cần kết nối Facebook Page Access Token trước._",
        ].join("\n"),
      };
    }

    case "xoa_bai": {
      return {
        text: [
          "🗑️ **Xóa Bài Đăng**",
          "",
          "Để xóa bài, Sếp cần cung cấp Post ID:",
          "• `/post_delete <post_id>` — Xóa bài viết",
          "",
          "Dùng `/post_list` để xem danh sách bài và lấy ID.",
        ].join("\n"),
      };
    }

    case "inbox_forward": {
      return {
        text: [
          "📤 **Chuyển Tiếp Tin Nhắn**",
          "",
          "Sếp có thể cấu hình chuyển tiếp inbox:",
          "• `/inbox_forward on` — Bật chuyển tiếp tin nhắn mới",
          "• `/inbox_forward off` — Tắt chuyển tiếp",
          "• `/inbox_forward status` — Xem trạng thái",
          "",
          "_Tin nhắn sẽ được forward về Telegram cho Sếp._",
        ].join("\n"),
      };
    }

    case "cai_dat_app": {
      if (!extractedArgs || !extractedArgs.includes("|")) {
        return {
          text: [
            "⚙️ **Cài Đặt Meta App**",
            "",
            "Sếp cần cung cấp App ID và App Secret:",
            "• Nhập: `<App ID 15 số> <App Secret 32 ký tự hex>`",
            "• Ví dụ: `123456789012345 abcdef1234567890abcdef1234567890`",
            "",
            "_Em sẽ tự động nhận diện và lưu vào hệ thống._",
          ].join("\n"),
        };
      }
      const [appId, appSecret] = extractedArgs.split("|");
      return {
        text: `✅ Đã ghi nhận App ID: \`${appId?.slice(0, 6)}...\` và App Secret. Sếp dùng \`/cau_hinh\` để kiểm tra lại ạ.`,
      };
    }

    case "content_gen": {
      try {
        const { chatCompletion } = await import("../services/fpt-ai-service.js");
        const { routeToModel } = await import("../services/fpt-model-router.js");
        const userMsg = extractedArgs || "Viết một mẫu quảng cáo";
        const routing = routeToModel(userMsg, "content_gen", context?.config?.business?.industry);
        api.logger?.info?.(`[INFO] Model handle: ${routing.model} (Task: Content Gen)`);
        const result = await chatCompletion({
          model: routing.model,
          messages: [
            { role: "system", content: routing.systemPrompt },
            { role: "user", content: userMsg },
          ],
          maxTokens: routing.maxTokens,
          temperature: routing.temperature,
        });
        return { text: `✍️ **Content AI (${routing.model}):**\n\n${result.content || ""}` };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        api.logger?.error?.("Content gen failed: " + errMsg);
        return { text: "❌ Không thể tạo content lúc này. Sếp thử lại sau ạ." };
      }
    }

    case "creative_review": {
      try {
        const { chatCompletion } = await import("../services/fpt-ai-service.js");
        const { routeToModel } = await import("../services/fpt-model-router.js");
        const userMsg = extractedArgs || "Nên dùng hình hay video?";
        const routing = routeToModel(userMsg, "creative_review", context?.config?.business?.industry);
        api.logger?.info?.(`[INFO] Model handle: ${routing.model} (Task: Creative Review)`);
        const result = await chatCompletion({
          model: routing.model,
          messages: [
            { role: "system", content: routing.systemPrompt },
            { role: "user", content: userMsg },
          ],
          maxTokens: routing.maxTokens,
          temperature: routing.temperature,
        });
        return { text: `🎨 **Creative Review AI (${routing.model}):**\n\n${result.content || ""}` };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        api.logger?.error?.("Creative review failed: " + errMsg);
        return { text: "❌ Không thể đánh giá creative lúc này. Sếp thử lại sau ạ." };
      }
    }

    case "sheets": {
      return {
        text: [
          "📊 **Google Sheets Integration**",
          "",
          "Chức năng xuất dữ liệu vào Google Sheets đang được thiết lập.",
          "",
          "Sếp có thể:",
          "• `/sheets_link <URL>` — Đặt sheet mặc định",
          "• `/sheets_export baocao` — Xuất báo cáo hiệu suất",
          "• `/sheets_export doithu` — Xuất phân tích đối thủ",
          "",
          "_Sếp cần share Google Sheet cho bot hoặc kết nối Google Account._",
        ].join("\n"),
      };
    }

    case "unknown":
    default: {
      if (!intent.extractedArgs) {
        return { text: buildConfusedResponse(intent.matchedPattern) };
      }
      
      try {
        api.logger?.info?.("Regex fallback triggered, using FPT AI for input: " + intent.extractedArgs);
        const industry = context?.config?.business?.industry || "Chưa rõ";
        let aiResponse = "";
        let usedModel = "";

        // Attempt 1: FPT AI — Intelligent Model Routing (Tool-Aware)
        if (process.env.FPT_AI_API_KEY) {
          try {
            const { chatCompletion } = await import("../services/fpt-ai-service.js");
            const { routeToModel } = await import("../services/fpt-model-router.js");
            const { createMcpToolGroup } = await import("../tools/mcp-workflow-tools.js");
            
            const routing = routeToModel(intent.extractedArgs, intent.action, industry);
            const mcpTools = createMcpToolGroup(api);
            const tools = mcpTools.map(t => ({
              type: "function" as const,
              function: { name: t.name, description: t.description, parameters: t.parameters as any }
            }));

            api.logger?.info?.(`[MCP 🤖] NLP Fallback with Tool Calling: ${routing.model}`);
            
            const result = await chatCompletion({
              model: routing.model,
              messages: [
                { role: "system", content: routing.systemPrompt },
                { role: "user", content: intent.extractedArgs },
              ],
              tools,
              toolChoice: "auto"
            });

            // Handle potential tool calls
            if (result.tool_calls && result.tool_calls.length > 0) {
              const toolCall = result.tool_calls[0];
              const tool = mcpTools.find(t => t.name === toolCall.function.name);
              if (tool && tool.execute) {
                api.logger?.info?.(`[MCP 🚀] NLP executing: ${tool.name}`);
                const args = JSON.parse(toolCall.function.arguments);
                const toolResult = await tool.execute(toolCall.id, args);
                
                const finalResult = await chatCompletion({
                  model: routing.model,
                  messages: [
                    { role: "system", content: routing.systemPrompt },
                    { role: "user", content: intent.extractedArgs },
                    { role: "assistant", content: null, tool_calls: result.tool_calls },
                    { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult.content) }
                  ]
                });
                aiResponse = finalResult.content || "";
              }
            } else {
              aiResponse = result.content || "";
            }
            usedModel = routing.model;
          } catch (e: unknown) {
            api.logger?.warn?.("FPT AI primary failed: " + (e instanceof Error ? e.message : String(e)));
          }
        }

        // Attempt 2: FPT Qwen3-32B (guaranteed strong fallback)
        if (!aiResponse && process.env.FPT_AI_API_KEY) {
          try {
            api.logger?.info?.(`[INFO] Model handle: Qwen3-32B (Task: NLP Fallback)`);
            const { chatCompletion } = await import("../services/fpt-ai-service.js");
            const result = await chatCompletion({
              model: "Qwen3-32B",
              messages: [
                { role: "system", content: `Bạn là chuyên gia Meta Ads Việt Nam. Ngành: ${industry}. Xưng "em" gọi "Sếp". Trả lời chuyên nghiệp, dưới 200 chữ.` },
                { role: "user", content: intent.extractedArgs },
              ],
              maxTokens: 400,
            });
            aiResponse = result.content || "";
            usedModel = "Qwen3-32B";
          } catch {
            api.logger?.warn?.("FPT Qwen3-32B fallback failed");
          }
        }

        // Attempt 3: FPT gpt-oss-120b (ultra heavy fallback)
        if (!aiResponse && process.env.FPT_AI_API_KEY) {
          try {
            api.logger?.info?.(`[INFO] Model handle: gpt-oss-120b (Task: NLP Fallback)`);
            const { chatCompletion } = await import("../services/fpt-ai-service.js");
            const result = await chatCompletion({
              model: "gpt-oss-120b",
              messages: [
                { role: "system", content: `Bạn là chuyên gia Meta Ads. Ngành: ${industry}. Xưng "em" gọi "Sếp".` },
                { role: "user", content: intent.extractedArgs },
              ],
              maxTokens: 400,
            });
            aiResponse = result.content || "";
            usedModel = "gpt-oss-120b";
          } catch {
            api.logger?.warn?.("FPT gpt-oss-120b fallback failed");
          }
        }

        /* 
        // Attempt 4: OpenAI (external backup — kept as last external resort)
        if (!aiResponse && process.env.OPENAI_API_KEY) {
          try {
            api.logger?.info?.(`[INFO] Model handle: o3-mini (Task: OpenAI Fallback)`);
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "o3-mini",
                messages: [
                  { role: "system", content: `Bạn là chuyên gia Meta Ads. Ngành: ${industry}. Xưng "em" gọi "Sếp". Ngắn gọn.` },
                  { role: "user", content: intent.extractedArgs },
                ],
                max_tokens: 300,
              }),
            });
            if (res.ok) {
              const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
              aiResponse = data.choices?.[0]?.message?.content?.trim() || "";
              usedModel = "o3-mini";
            }
          } catch {
            api.logger?.warn?.("OpenAI fallback failed");
          }
        }

        // Attempt 5: Local OpenClaw Gateway (last resort)
        if (!aiResponse) {
          try {
            console.log(`[Bot Processing] 🏠 Attempt 5 (OpenClaw Local Gateway) -> Gọi Endpoint: 127.0.0.1:18789 | Model: openclaw`);
            const res = await fetch("http://127.0.0.1:18789/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer local" },
              body: JSON.stringify({
                model: "openclaw",
                messages: [
                  { role: "system", content: `Bạn là chuyên gia Meta Ads. Ngành: ${industry}.` },
                  { role: "user", content: intent.extractedArgs },
                ],
                max_tokens: 250,
              }),
            });
            if (res.ok) {
              const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
              aiResponse = data.choices?.[0]?.message?.content?.trim() || "";
              usedModel = "openclaw-local";
            }
          } catch {
            // Last resort also failed
          }
        }
        */

        if (!aiResponse) throw new Error("All LLM attempts failed (FPT×3)");

        return { 
          text: `🤖 **AI Tư Vấn** _(${usedModel})_:\n${aiResponse}\n\n_Gợi ý: Dùng /de_xuat để xem thêm báo cáo chi tiết._` 
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        api.logger?.error?.("LLM Fallback failed: " + errMsg);
        return { text: buildConfusedResponse(intent.matchedPattern) };
      }
    }
  }
}

// ─── Greeting Detector ────────────────────────────────────────────────────────

export function isGreeting(message: string): boolean {
  return /^(xin ch[àa]o|ch[àa]o|hello|hi|hey|ờm|ừm|ok bot|bot ơi|\bstart\b|bắt đầu|mở)/i.test(
    message.trim(),
  );
}

/**
 * registerChatHandler — Plugin registration hook
 */
export function registerChatHandler(api: OpenClawPluginApi, config: AdsManagerPluginConfig) {
  api.logger?.info?.("[ads-campaign-manager] Registering Chat Handler (English Prompts)...");

  api.on("message_received", async (event: PluginHookMessageReceivedEvent, ctx: PluginHookMessageContext) => {
    const text = event.content;
    const isPriceCmd = text && /^\/?price_apify/i.test(text);
    if (!text || (text.startsWith("/") && !isPriceCmd)) return;

    const intent = detectIntent(text);
    
    try {
      const { loadAssistantContext } = await import("../assistant/index.js");
      const assistantContext = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig: config,
      });

      const response = await fulfillIntent({
        intent,
        context: assistantContext,
        api
      });
      if (response && response.text) {
        await sendReply(api, ctx, response.text);
      }
    } catch (err) {
      api.logger?.error?.(`[chat-handler] Error: ${err}`);
      await sendReply(api, ctx, "⚠️ Professional error encountered. Please use specific commands.");
    }
  });

  api.logger?.info?.("[ads-campaign-manager] ✅ Chat Handler active.");
}

/**
 * Generic reply helper
 */
async function sendReply(api: OpenClawPluginApi, ctx: PluginHookMessageContext, text: string) {
  const { channelId, conversationId, accountId } = ctx;
  if (channelId === "telegram" && api.runtime.channel.telegram) {
    await api.runtime.channel.telegram.sendMessageTelegram(conversationId || "", text, {
      accountId: accountId || "default"
    });
  }
}
