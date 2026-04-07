import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { CreativeVisionService, forecast30Days } from "../services/vision-analysis.js";
import { loadAssistantContext } from "../assistant/context.js";

export function createVisionTools(params: { api: OpenClawPluginApi; pluginConfig: any }): AnyAgentTool[] {
  
  // ─ Tool 1: ads_manager_analyze_creative ────────────────────────────────
  const analyzeCreativeTool: AnyAgentTool = {
    name: "ads_manager_analyze_creative",
    label: "AI Creative Visual Audit",
    description: "Sử dụng Claude 3.5 Sonnet Vision để phân tích hình ảnh quảng cáo. Đánh giá bố cục, màu sắc và nội dung truyền tải.",
    parameters: Type.Object({
      imageUrl: Type.String({ description: "URL công khai của hình ảnh quảng cáo" }),
      adText: Type.Optional(Type.String({ description: "Văn bản đi kèm mẫu quảng cáo" }))
    }),
    execute: async (_id, raw: any) => {
      const apiKey = params.pluginConfig.intelligence?.mistral?.apiTokenEnvVar // Reuse existing key logic if needed, or better, use a dedicated one
        ? process.env[params.pluginConfig.intelligence.mistral.apiTokenEnvVar]
        : process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        return { content: [{ type: "text", text: "Thiếu Anthropic API Key để thực hiện Vision Analysis. Sếp hãy kiểm tra lại cấu hình nhé." }], details: {} };
      }

      const visionService = new CreativeVisionService(apiKey);
      const result = await visionService.analyzeImageUrl(params.pluginConfig, raw.imageUrl, raw.adText);
      
      let text = `👁️ KẾT QUẢ PHÂN TÍCH HÌNH ẢNH (AI VISION):\n`;
      text += `🎯 **SCORE: ${result.finalScore}/100**\n\n`;
      text += `🖼️ **Bố cục**: ${result.visualHierarchy}\n`;
      text += `🎨 **Màu sắc**: ${result.contrastAndColor}\n`;
      text += `📖 **Độ dễ đọc**: ${result.readability}\n`;
      text += `❤️ **Cảm xúc**: ${result.emotionalImpact}\n\n`;
      text += `🚀 **Đề xuất cải thiện**:\n`;
      result.keyImprovements.forEach((imp: any) => text += `- ${imp}\n`);
      
      return { content: [{ type: "text" as const, text }], details: result };
    },
  };

  // ─ Tool 2: ads_manager_forecast_30d ───────────────────────────────────
  const forecastTool: AnyAgentTool = {
    name: "ads_manager_forecast_30d",
    label: "30-Day Predictive Forecasting",
    description: "Dự báo hiệu quả quảng cáo (Budget, CPA, ROAS) trong 30 ngày tới dựa trên kịch bản tăng trưởng ngân sách.",
    parameters: Type.Object({
      campaignId: Type.Optional(Type.String({ description: "ID chiến dịch cụ thể (nếu có)" }))
    }),
    execute: async (_id, raw: any) => {
      const context = await loadAssistantContext({
        runtime: params.api.runtime,
        pluginConfig: params.pluginConfig,
        logger: console as any
      });

      if (!context.snapshot) return { content: [{ type: "text", text: "Không có dữ liệu snapshot để dự báo." }], details: {} };

      // Lấy historical data từ campaign đầu tiên hoặc campaign cụ thể
      const targetCampaign = raw.campaignId 
        ? context.snapshot.campaigns.find(c => c.id === raw.campaignId)
        : context.snapshot.campaigns[0];

      if (!targetCampaign || !targetCampaign.historicalData) {
        return { content: [{ type: "text", text: "Chiến dịch chưa có đủ dữ liệu lịch sử (7-14 ngày) để chạy mô hình dự báo." }], details: {} };
      }

      const prediction = forecast30Days(targetCampaign.historicalData, params.pluginConfig.thresholds.minRoas);
      
      let text = `🔮 DỰ BÁO HIỆU QUẢ 30 NGÀY (PREDICTIVE ANALYTICS):\n`;
      text += `Chiến dịch: **${targetCampaign.name}**\n\n`;

      if (!prediction.canScale && (prediction as any).windowSize < 7) {
        text += `⚠️ **CẢNH BÁO**: ${prediction.reason}`;
        return { content: [{ type: "text" as const, text }], details: prediction };
      }

      const p = prediction as any;
      text += `| Kịch bản | CPA Dự phóng | ROAS Dự phóng | Trạng thái |\n`;
      text += `| :--- | :--- | :--- | :--- |\n`;
      
      p.scenarios?.forEach((s: any) => {
        const icon = s.health === "Safe" ? "✅" : "⚠️";
        text += `| **${s.multiplier}** | ${s.pCPA.toLocaleString()}đ | ${s.pROAS}x | ${icon} ${s.health} |\n`;
      });

      text += `\n📌 **KẾT LUẬN**: ${p.summary}\n`;
      text += `⚠️ **Trần Ngân Sách (Ceiling)**: ${p.scaleCeiling}`;
      
      return { content: [{ type: "text" as const, text }], details: prediction };
    },
  };

  return [analyzeCreativeTool, forecastTool];
}
