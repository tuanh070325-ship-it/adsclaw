import { requestGraphJson } from "./api-client.js";
import type { AdsManagerPluginConfig } from "../core/types.js";
import logger from "../core/logger.js";

/**
 * Creates a Meta Ad Creative (Page Post Ad).
 * Optimization #4: Focus on Headline-first copywriting.
 * Optimization #8: Message matching with landing page.
 */
export async function createMetaAdCreative(
  config: AdsManagerPluginConfig,
  accessToken: string,
  adAccountId: string,
  params: {
    name: string;
    pageId: string;
    imageHash?: string;
    videoId?: string;
    headline: string;
    body: string;
    linkUrl: string;
    callToAction: 'SHOP_NOW' | 'LEARN_MORE' | 'SIGN_UP' | 'MESSAGE_PAGE';
  }
): Promise<string> {
  logger.info(`[CREATIVE] Creating ad creative: ${params.name}`);

  const objectStorySpec: any = {
    page_id: params.pageId,
    link_data: {
      link: params.linkUrl,
      message: params.body,
      caption: "Learn More",
      description: params.headline, // Headline is often placed here in older API versions or in 'name'
      image_hash: params.imageHash,
      video_id: params.videoId,
      call_to_action: {
        type: params.callToAction,
        value: {
          link: params.linkUrl,
        },
      },
    },
  };

  const res = await requestGraphJson<{ id: string }>({
    config,
    accessToken,
    pathOrUrl: `/${adAccountId}/adcreatives`,
    method: "POST",
    body: {
      name: params.name,
      object_story_spec: JSON.stringify(objectStorySpec),
    },
  });

  const creativeId = res.id;
  if (!creativeId) {
    throw new Error("Meta ad creative creation successful but no ID returned.");
  }

  logger.info(`[CREATIVE] Success. Created Ad Creative ID: ${creativeId}`);
  return creativeId;
}
