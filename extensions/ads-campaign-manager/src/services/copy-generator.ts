import { chatCompletion } from "./fpt-ai-service.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

export class CopyGeneratorService {
  constructor(private apiKey?: string) {}

  /**
   * Generate multiple ad variants using FPT AI.
   */
  async generateVariants(config: AdsManagerPluginConfig, params: { productDescription: string }): Promise<Array<{ headline: string; body: string }>> {
    const prompt = `You are an expert Meta Ads copywriter. Generate 3 different ad variants for the following product: ${params.productDescription}.
Format each variant as:
Headline: [headline]
Body: [body]
---`;

    try {
      const result = await chatCompletion({
        model: "gemma-4-31B-it", // Default for content_gen task in FPT
        messages: [
          { role: "system", content: "Expert copywriter. Output headline and body for 3 variants." },
          { role: "user", content: prompt }
        ],
        maxTokens: 1000,
        temperature: 0.8
      });

      const content = result.content || "";
      const variantBlocks = content.split("---").filter(b => b.trim().length > 0);
      
      const variants = variantBlocks.map(block => {
        const headlineMatch = block.match(/Headline:\s*(.*)/i);
        const bodyMatch = block.match(/Body:\s*([\s\S]*)/i);
        return {
          headline: headlineMatch ? headlineMatch[1].trim() : "Special Offer",
          body: bodyMatch ? bodyMatch[1].trim() : params.productDescription
        };
      });

      return variants.slice(0, 3);
    } catch (e: any) {
      logger.error(`[COPY GEN] Generation failed: ${e.message}. Using fallback.`);
      return [{ headline: "Special Offer", body: params.productDescription }];
    }
  }
}
