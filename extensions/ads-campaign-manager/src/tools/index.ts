
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { AdsManagerPluginConfig } from "../core/types.js";
import { createToolGroup as createCampaign } from "./campaign-tools.js";
import { createToolGroup as createSearch } from "./search-tools.js";
import { createToolGroup as createFacebook } from "./facebook-tools.js";
import { createV2Tools } from "./v2-advanced-tools.js";
import { createBMTools } from "./bm-tools.js";
import { createVisionTools } from "./vision-tools.js";

import { createMcpToolGroup } from "./mcp-workflow-tools.js";

export function createAdsManagerTool(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): AnyAgentTool[] {
  return [
    ...createCampaign(params),
    ...createSearch(params),
    ...createFacebook(params),
    ...createV2Tools(params),
    ...createBMTools(params),
    ...createVisionTools(params),
    ...createMcpToolGroup(params.api)
  ];
}
