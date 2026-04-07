import { requestGraphJson } from "./api-client.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Creates a Meta Ad by linking an Ad Set and an Ad Creative.
 * Safety Mode: Always created as PAUSED.
 */
export async function createMetaAd(
  config: AdsManagerPluginConfig,
  accessToken: string,
  adAccountId: string,
  params: {
    adsetId: string;
    creativeId: string;
    name: string;
  }
): Promise<string> {
  logger.info(`[AD] Creating ad: ${params.name} for Ad Set: ${params.adsetId}`);

  let res;
  try {
    res = await requestGraphJson<{ id: string }>({
      config,
      accessToken,
      pathOrUrl: `/${adAccountId}/ads`,
      method: "POST",
      body: {
        adset_id: params.adsetId,
        creative: JSON.stringify({ creative_id: params.creativeId }),
        name: params.name,
        status: "PAUSED", // Safety default
      },
    });
  } catch (err: any) {
    if (err.message && (err.message.includes("No payment method") || err.message.includes("1359188"))) {
      throw new Error(`🔴 LỖI TỪ CHỐI TẠO ADS: Tài khoản quảng cáo (BM/Cá nhân) này chưa Add Thẻ Thanh Toán (Visa/Mastercard).\nMeta không cho phép lưu nháp bài QC (Ad Object) nếu tài khoản không có phương thức thanh toán dự phòng.\n👉 Vui lòng thêm thẻ vào Cài đặt thanh toán rồi thử lại!`);
    }
    throw err;
  }

  const adId = res.id;
  if (!adId) {
    throw new Error("Meta ad creation successful but no ID returned.");
  }

  logger.info(`[AD] Success. Created Ad ID: ${adId}`);
  return adId;
}
