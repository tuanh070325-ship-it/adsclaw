import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../test-utils/plugin-api.js";
import plugin from "./index.js";

describe("ads campaign manager plugin registration", () => {
  it("registers tool, commands, cli, and service", async () => {
    const registerTool = vi.fn();
    const registerCommand = vi.fn();
    const registerCli = vi.fn();
    const registerService = vi.fn();

    await plugin.register?.(
      createTestPluginApi({
        id: "ads-campaign-manager",
        name: "Ads Campaign Manager",
        source: "test",
        config: {},
        runtime: {} as never,
        registerTool,
        registerCommand,
        registerCli,
        registerService,
      }) as OpenClawPluginApi,
    );

    expect(registerTool).toBeCalled();
    expect(registerService).toBeCalled();
    expect(registerCli).toBeCalled();
    expect(registerCommand).toHaveBeenCalledTimes(43);
  });
});
