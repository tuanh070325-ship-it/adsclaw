/**
 * mcp-workflow-tools.ts — Agentic MCP Workflow Tools
 * ───────────────────────────────────────────────────
 * High-level tools that allow the AI to discover and run
 * Apify Actors safely with cost optimization.
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getApifyMcpClient } from "../services/apify-mcp-client.js";

export function createMcpToolGroup(api: OpenClawPluginApi): AnyAgentTool[] {
  const logger = api.logger;

  /**
   * Tool: apify_discovery
   * Search for the best scrapers/actors for a specific niche.
   */
  const discoveryTool: AnyAgentTool = {
    name: "apify_discovery",
    label: "Apify Tool Discovery",
    description: "Search the Apify Store for specific scrapers (e.g. 'facebook ads', 'google maps woodwork'). Returns actor IDs and descriptions.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query for the tool you need" }),
    }),
    execute: async (_id, raw: any) => {
      try {
        const mcp = await getApifyMcpClient();
        logger.info(`[MCP 🔍] Searching for actors with query: ${raw.query}`);
        
        const result = await mcp.callTool("search-actors", { 
          keywords: raw.query
        });

        return {
          content: result.content as any,
          details: result
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Discovery failed: ${error.message}` }] as any,
          details: { error: error.message }
        };
      }
    }
  };

  /**
   * Tool: apify_execute_safe
   * Run an actor with FORCED cost-saving parameters.
   */
  const executeSafeTool: AnyAgentTool = {
    name: "apify_facebook_ads",
    label: "Apify Ads Execution (Safe)",
    description: "Run an Apify Actor with built-in cost protection. Automatically enforces maxItems and proxy settings.",
    parameters: Type.Object({
      actorId: Type.String({ description: "The ID of the actor to run (e.g. 'apify/facebook-ads-scraper')" }),
      input: Type.Object({}, { additionalProperties: true, description: "Actor input parameters" }),
      maxItems: Type.Optional(Type.Number({ default: 5, description: "Max results to fetch (Cost Limit)" })),
    }),
    execute: async (_id, raw: any) => {
      try {
        const mcp = await getApifyMcpClient();
        const actorId = raw.actorId;
        const limit = raw.maxItems ?? 5;

        // Forced cost-saving parameter injection
        const safeInput = {
          ...raw.input,
          maxItems: limit,
          maxResults: limit, 
          resultsLimit: limit,
          // Support generic "keywords" field for keyword-based actors
          q: raw.input?.keywords ?? raw.input?.q,
          searchQuery: raw.input?.keywords ?? raw.input?.searchQuery,
          query: raw.input?.keywords ?? raw.input?.query,
          proxyConfiguration: { useApifyProxy: true },
        };

        logger.info(`[MCP 💰] Safe Execution triggered for ${actorId} with limit ${limit}`);

        // 2. Run the actor tool
        const result = await mcp.callTool("call-actor", {
          actorId,
          input: safeInput
        });

        return {
          content: result.content as any,
          details: result
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Execution failed: ${error.message}` }] as any,
          details: { error: error.message }
        };
      }
    }
  };

  return [discoveryTool, executeSafeTool];
}
