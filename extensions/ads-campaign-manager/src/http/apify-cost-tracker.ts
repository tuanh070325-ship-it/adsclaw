import { executeQuery } from "../core/db.js";
import type { AdsManagerPluginConfig } from "../core/types.js";

/**
 * DDL for the Apify cost log table.
 */
export const APIFY_COST_LOG_DDL = `
  CREATE TABLE IF NOT EXISTS apify_cost_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    business_id VARCHAR(64) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    actor_label VARCHAR(255),
    run_id VARCHAR(128),
    usage_usd DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_business_date (business_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/**
 * Logs the cost of an Apify run to the database.
 */
export async function logApifyCost(params: {
  config: AdsManagerPluginConfig;
  businessId: string;
  actorId: string;
  actorLabel: string;
  runId: string;
  usageUsd: number;
}): Promise<void> {
  const { config, businessId, actorId, actorLabel, runId, usageUsd } = params;
  
  if (usageUsd <= 0) return;

  try {
    await executeQuery(
      config,
      `INSERT INTO apify_cost_log (business_id, actor_id, actor_label, run_id, usage_usd) 
       VALUES (?, ?, ?, ?, ?)`,
      [businessId, actorId, actorLabel, runId, usageUsd]
    );
    console.log(`[cost-tracker] 💰 [APIFY COST] Actor: ${actorLabel} | RunID: ${runId} | Cost: $${usageUsd.toFixed(6)}`);
  } catch (err) {
    console.error(`[cost-tracker] ⚠️ Failed to log cost: ${err}`);
  }
}

/**
 * Retrieves the total cost for a business within a date range.
 */
export async function getTotalApifyCost(config: AdsManagerPluginConfig, businessId: string, days: number = 30): Promise<{
  totalUsd: number;
  todayUsd: number;
  last30DaysUsd: number;
}> {
  const [totalRes, todayRes, monthRes] = await Promise.all([
    executeQuery<any[]>(config, `SELECT SUM(usage_usd) as total FROM apify_cost_log WHERE business_id = ?`, [businessId]),
    executeQuery<any[]>(config, `SELECT SUM(usage_usd) as total FROM apify_cost_log WHERE business_id = ? AND DATE(created_at) = CURDATE()`, [businessId]),
    executeQuery<any[]>(config, `SELECT SUM(usage_usd) as total FROM apify_cost_log WHERE business_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`, [businessId, days])
  ]);

  return {
    totalUsd: Number(totalRes?.[0]?.total || 0),
    todayUsd: Number(todayRes?.[0]?.total || 0),
    last30DaysUsd: Number(monthRes?.[0]?.total || 0)
  };
}
