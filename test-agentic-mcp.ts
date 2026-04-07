import dotenv from "dotenv";
import { chatCompletion } from "./extensions/ads-campaign-manager/src/services/fpt-ai-service.js";
import { routeToModel } from "./extensions/ads-campaign-manager/src/services/fpt-model-router.js";
import { createMcpToolGroup } from "./extensions/ads-campaign-manager/src/tools/mcp-workflow-tools.js";

dotenv.config();

const mockApi = {
  logger: {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
  }
} as any;

async function runScenario(question: string) {
  console.log(`\n\n=== 🧪 TEST SCENARIO: "${question}" ===`);
  
  const industry = "Đồ gỗ mỹ nghệ";
  const routing = routeToModel(question, "onboard_search", industry);
  const mcpTools = createMcpToolGroup(mockApi);
  
  const tools = mcpTools.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters as any }
  }));

  console.log(`🤖 Model selects: ${routing.model}`);

  // Step 1: Initial AI thinking
  const result = await chatCompletion({
    model: routing.model,
    messages: [
      { role: "system", content: routing.systemPrompt },
      { role: "user", content: question },
    ],
    tools,
    toolChoice: "auto"
  });

  if (result.tool_calls && result.tool_calls.length > 0) {
    for (const toolCall of result.tool_calls) {
      console.log(`🎯 AI wants to call: ${toolCall.function.name}`);
      console.log(`📦 Arguments: ${toolCall.function.arguments}`);
      
      const tool = mcpTools.find(t => t.name === toolCall.function.name);
      if (tool && tool.execute) {
        console.log(`🚀 Executing tool...`);
        const args = JSON.parse(toolCall.function.arguments);
        const toolResult = await tool.execute(toolCall.id, args);
        
        console.log(`✅ Tool returned data: ${JSON.stringify(toolResult.content).substring(0, 300)}...`);

        // Step 2: AI final answer
        const finalResult = await chatCompletion({
          model: routing.model,
          messages: [
            { role: "system", content: routing.systemPrompt },
            { role: "user", content: question },
            { role: "assistant", content: null, tool_calls: [toolCall] },
            { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult.content) }
          ]
        });
        
        console.log(`📝 FINAL AI RESPONSE:\n${finalResult.content}`);
      }
    }
  } else {
    console.log(`📝 AI Response (No tools): ${result.content}`);
  }
}

async function startTests() {
  try {
    // Scenario 1: Discovery + Industry Focus
    await runScenario("Tìm cho anh scraper nào tốt nhất để soi quảng cáo gỗ mỹ nghệ trên Facebook");

    // Scenario 2: Direct Execution with Cost Protection
    await runScenario("Chạy quét đối thủ cho anh bằng tool apify/facebook-ads-scraper, mục tiêu là từ khóa 'sập thờ gỗ mít'");

    console.log("\n\n✅ ALL TESTS COMPLETED.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test script failed:", err);
    process.exit(1);
  }
}

startTests();
