import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.join(process.cwd(), ".env") });
import { chatCompletion } from "./extensions/ads-campaign-manager/src/services/fpt-ai-service.js";

async function test() {
  console.log("🚀 Testing FPT AI with Kimi-K2.5...");
  console.log(`API Key: ${process.env.FPT_AI_API_KEY?.slice(0, 8)}...`);
  console.log(`Base URL: ${process.env.FPT_AI_BASE_URL}`);
  console.log(`Default Model: ${process.env.FPT_AI_DEFAULT_MODEL}`);

  try {
    const response = await chatCompletion({
      model: "Kimi-K2.5",
      messages: [
        { role: "user", content: "Xin chào Kimi, bạn đã sẵn sàng chưa?" }
      ],
      maxTokens: 50
    });
    console.log("\n✅ Response from Kimi-K2.5:");
    console.log(response);
  } catch (error) {
    console.log("\n❌ Test failed!");
    console.error(error);
  }
}

test();
