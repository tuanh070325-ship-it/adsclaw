import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { AdsManagerPluginConfig } from "../../core/types.js";

import { register_auth_commands } from "./auth-commands.js";
import { register_page_commands } from "./page-commands.js";
import { register_post_commands } from "./post-commands.js";
import { register_report_commands } from "./report-commands.js";
import { register_bot_commands } from "./bot-commands.js";
import { register_menu_commands } from "./menu-commands.js";
import { register_ai_commands } from "./ai-commands.js";

export async function registerAdsManagerCommands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): Promise<void> {
  register_auth_commands(params);
  register_page_commands(params);
  register_post_commands(params);
  register_report_commands(params);
  register_bot_commands(params);
  register_menu_commands(params);
  register_ai_commands(params);

  // Register Autonomous Mastery Commands (Phase 5)
  try {
    const { registerAdsManagerCliCommands } = await import("./ads-commands.js");
    registerAdsManagerCliCommands({ 
      api: params.api, 
      root: (params as any).root || (params as any).program, // Handle both naming conventions
      pluginConfig: params.pluginConfig 
    });
  } catch (e) {
    // Ignore context-specific failures
  }
}
