import fs from "node:fs";
import crypto from "node:crypto";
import FormData from "form-data";
import { requestGraphJson } from "./api-client.js";
import { getMetaIdByHash, saveMediaHashMapping } from "./hash-cache.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Calculates SHA-256 hash of a local file.
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Uploads an image to Meta Graph API with deduplication logic.
 */
export async function uploadMetaImage(
  config: AdsManagerPluginConfig,
  accessToken: string,
  adAccountId: string,
  filePath: string
): Promise<string> {
  const localHash = await calculateFileHash(filePath);
  
  // 1. Check Cache
  const cachedId = await getMetaIdByHash(config, localHash);
  if (cachedId) {
    logger.info(`[MEDIA] Cache HIT for image: ${localHash.substring(0, 8)}... -> ${cachedId}`);
    return cachedId;
  }

  // 2. Upload to Meta
  logger.info(`[MEDIA] Cache MISS. Uploading image: ${filePath}`);
  const form = new FormData();
  form.append("filename", fs.createReadStream(filePath));
  form.append("access_token", accessToken);

  const res = await requestGraphJson<{ images: Record<string, { hash: string }> }>({
    config,
    accessToken,
    pathOrUrl: `/${adAccountId}/adimages`,
    method: "POST",
    body: form,
  });

  // Meta returns the image hash as the unique ID for Ad Creatives
  const metaHash = Object.values(res.images)[0]?.hash;
  if (!metaHash) {
    throw new Error("Meta image upload successful but no hash returned.");
  }

  // 3. Save to Cache
  await saveMediaHashMapping(config, {
    localHash,
    metaId: metaHash,
    mediaType: "image",
  });

  return metaHash;
}

/**
 * Uploads a video to Meta Graph API (Simplified Async Upload).
 * For production, consider the "Resumable Upload" flow for large files.
 */
export async function uploadMetaVideo(
  config: AdsManagerPluginConfig,
  accessToken: string,
  adAccountId: string,
  filePath: string,
  title?: string
): Promise<string> {
  const localHash = await calculateFileHash(filePath);
  
  // 1. Check Cache
  const cachedId = await getMetaIdByHash(config, localHash);
  if (cachedId) {
    logger.info(`[MEDIA] Cache HIT for video: ${localHash.substring(0, 8)}... -> ${cachedId}`);
    return cachedId;
  }

  // 2. Upload to Meta
  logger.info(`[MEDIA] Cache MISS. Uploading video: ${filePath}`);
  const form = new FormData();
  form.append("source", fs.createReadStream(filePath));
  if (title) form.append("title", title);
  form.append("access_token", accessToken);

  const res = await requestGraphJson<{ id: string }>({
    config,
    accessToken,
    pathOrUrl: `/${adAccountId}/advideos`,
    method: "POST",
    body: form,
  });

  const videoId = res.id;
  if (!videoId) {
    throw new Error("Meta video upload successful but no ID returned.");
  }

  // 3. Save to Cache
  await saveMediaHashMapping(config, {
    localHash,
    metaId: videoId,
    mediaType: "video",
  });

  return videoId;
}
