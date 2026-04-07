import { executeQuery } from "../core/db.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Initializes the media_hash_cache table in the MySQL database.
 * Table maps: Local SHA-256 -> Meta-assigned Hash/ID (Facebook side).
 */
export async function initMediaHashCacheTable(config: AdsManagerPluginConfig): Promise<void> {
  if (!config.database?.enabled) return;

  await executeQuery(config, `
    CREATE TABLE IF NOT EXISTS media_hash_cache (
      local_hash VARCHAR(128) PRIMARY KEY,
      meta_id VARCHAR(128) NOT NULL,
      media_type ENUM('image', 'video') NOT NULL,
      observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_meta_id (meta_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * Retrieves the Meta ID (Facebook Side) for a given local file hash.
 */
export async function getMetaIdByHash(
  config: AdsManagerPluginConfig,
  localHash: string
): Promise<string | null> {
  const rows = await executeQuery<any[]>(
    config,
    "SELECT meta_id FROM media_hash_cache WHERE local_hash = ?",
    [localHash]
  );
  return rows?.[0]?.meta_id || null;
}

/**
 * Stores a mapping from Local Hash to Meta ID.
 */
export async function saveMediaHashMapping(
  config: AdsManagerPluginConfig,
  params: {
    localHash: string;
    metaId: string;
    mediaType: 'image' | 'video';
  }
): Promise<void> {
  await executeQuery(
    config,
    "INSERT INTO media_hash_cache (local_hash, meta_id, media_type) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE meta_id = VALUES(meta_id)",
    [params.localHash, params.metaId, params.mediaType]
  );
  logger.info(`[HASH_CACHE] Saved mapping: ${params.localHash.substring(0, 8)}... -> ${params.metaId}`);
}
