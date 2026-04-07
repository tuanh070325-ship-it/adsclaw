import axios from "axios";
import logger from "../core/logger.js";

/**
 * Validates the performance and content match of a landing page.
 * Optimization #8: Enforcing <3s load time and message match.
 */
export class LandingPageValidator {
  /**
   * Measures page load time and checks for basic presence of content.
   */
  static async validatePage(url: string, expectedKeywords: string[]): Promise<{
    loadTimeMs: number;
    isValid: boolean;
    reason?: string;
  }> {
    const start = Date.now();
    try {
      const response = await axios.get(url, { timeout: 10000 }); // 10s max
      const end = Date.now();
      const loadTimeMs = end - start;

      // 1. Load Time Check (Optimization #8)
      if (loadTimeMs > 3000) {
        logger.warn(`[LP_VALIDATOR] SLOW LOAD: ${loadTimeMs}ms for ${url}`);
        return { loadTimeMs, isValid: false, reason: "LOAD_TIME_TOO_SLOW" };
      }

      // 2. Message Match Check (Simple Keyword Presence)
      const content = response.data.toString().toLowerCase();
      const missingKeywords = expectedKeywords.filter(k => !content.includes(k.toLowerCase()));

      if (missingKeywords.length > 0) {
        logger.warn(`[LP_VALIDATOR] MESSAGE MISMATCH: Missing keywords: ${missingKeywords.join(", ")}`);
        return { loadTimeMs, isValid: false, reason: "MESSAGE_MISMATCH" };
      }

      logger.info(`[LP_VALIDATOR] Success: ${url} loaded in ${loadTimeMs}ms with all keywords.`);
      return { loadTimeMs, isValid: true };

    } catch (err: any) {
      logger.error(`[LP_VALIDATOR] FAILED to fetch ${url}: ${err.message}`);
      return { loadTimeMs: 0, isValid: false, reason: `FETCH_ERROR: ${err.message}` };
    }
  }
}
