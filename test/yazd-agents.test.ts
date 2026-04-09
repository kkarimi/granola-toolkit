import type { YazdAgentTask } from "@kkarimi/yazd-core";
import { describe, expect, test, vi } from "vite-plus/test";

import { createGranolaYazdAgentPlugin, listGranolaYazdAgentPlugins } from "../src/yazd-agents.ts";
import type { GranolaAutomationAgentRunner } from "../src/agents.ts";
import type { AppConfig } from "../src/types.ts";

function createConfig(): AppConfig {
  return {
    agents: {
      codexCommand: "codex",
      defaultProvider: "codex",
      dryRun: false,
      harnessesFile: "/tmp/agent-harnesses.json",
      maxRetries: 2,
      openaiBaseUrl: "https://api.openai.com/v1",
      openrouterBaseUrl: "https://openrouter.ai/api/v1",
      timeoutMs: 30_000,
    },
    debug: false,
    notes: {
      output: "/tmp/notes",
      timeoutMs: 120_000,
    },
    transcripts: {
      cacheFile: "/tmp/cache.json",
      output: "/tmp/transcripts",
    },
  };
}

describe("Gran Yazd agent plugins", () => {
  test("lists one plugin per built-in provider", () => {
    const plugins = listGranolaYazdAgentPlugins(createConfig());

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "gran/codex",
      "gran/openai",
      "gran/openrouter",
    ]);
    expect(plugins.map((plugin) => plugin.label)).toEqual([
      "Gran via Codex",
      "Gran via OpenAI",
      "Gran via OpenRouter",
    ]);
  });

  test("maps Yazd agent tasks onto the Gran agent runner", async () => {
    const run = vi.fn(async () => ({
      dryRun: false,
      model: "openai/gpt-5-mini",
      output: "# Final notes",
      prompt: "ignored",
      provider: "openrouter" as const,
      systemPrompt: "You are concise.",
    }));
    const runner: GranolaAutomationAgentRunner = {
      run,
    };
    const plugin = createGranolaYazdAgentPlugin({
      config: createConfig(),
      cwd: "/tmp/workspace",
      provider: "openrouter",
      runner,
    });
    const task: YazdAgentTask = {
      attachments: [
        {
          contentType: "text/markdown",
          id: "meeting-note",
          label: "Meeting note",
          text: "# Raw note",
        },
        {
          id: "empty-context",
          label: "Empty context",
        },
      ],
      model: "openai/gpt-5-mini",
      prompt: "Summarise the meeting.",
      systemPrompt: "You are concise.",
    };

    const result = await plugin.run(task);

    expect(run).toHaveBeenCalledWith({
      cwd: "/tmp/workspace",
      model: "openai/gpt-5-mini",
      prompt:
        "Summarise the meeting.\n\nContext attachments:\n\n### Meeting note (text/markdown)\n# Raw note",
      provider: "openrouter",
      systemPrompt: "You are concise.",
    });
    expect(result).toEqual({
      markdown: "# Final notes",
      model: "openai/gpt-5-mini",
      text: "# Final notes",
    });
  });
});
