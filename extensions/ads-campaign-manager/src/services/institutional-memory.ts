import { executeQuery } from "../core/db.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Manages the "Institutional Memory" of the Ads Bot.
 * Learning from past tests: Hypothesis, Result, Learning.
 */
export class InstitutionalMemoryService {
  /**
   * Initializes the memory table.
   */
  static async initMemoryTable(config: AdsManagerPluginConfig): Promise<void> {
    if (!config.database?.enabled) return;

    await executeQuery(config, `
      CREATE TABLE IF NOT EXISTS ads_test_memories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        business_id VARCHAR(64) NOT NULL,
        campaign_name VARCHAR(255) NOT NULL,
        hypothesis TEXT NOT NULL,
        result_metrics JSON,
        outcome_learning TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_business (business_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  /**
   * Records a new test memory.
   */
  static async recordMemory(
    config: AdsManagerPluginConfig,
    businessId: string,
    params: {
      campaignName: string;
      hypothesis: string;
      resultMetrics: any;
      outcomeLearning: string;
    }
  ): Promise<void> {
    await executeQuery(
      config,
      `INSERT INTO ads_test_memories (business_id, campaign_name, hypothesis, result_metrics, outcome_learning)
       VALUES (?, ?, ?, ?, ?)`,
      [businessId, params.campaignName, params.hypothesis, JSON.stringify(params.resultMetrics), params.outcomeLearning]
    );

    logger.info(`[MEMORY] Recorded new learning: ${params.campaignName}`);
  }

  /**
   * Retrieves past learnings to avoid repeating mistakes.
   */
  static async getPastLearnings(config: AdsManagerPluginConfig, businessId: string): Promise<any[]> {
    const rows = await executeQuery<any[]>(
      config,
      "SELECT * FROM ads_test_memories WHERE business_id = ? ORDER BY created_at DESC LIMIT 50",
      [businessId]
    );
    return rows ?? [];
  }
}
