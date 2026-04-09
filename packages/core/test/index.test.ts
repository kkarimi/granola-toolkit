import { describe, expect, it } from "vitest";

import {
  createGranolaYazdAgentPlugin,
  buildObsidianOpenFileUri,
  listGranolaExportTargetDefinitions,
  loadConfig,
} from "../src/index.ts";

describe("@kkarimi/gran-core", () => {
  it("exports shared helper functions", () => {
    expect(
      buildObsidianOpenFileUri({
        filePath: "/tmp/example.md",
        target: {
          outputDir: "/tmp/vault",
          vaultName: "Work",
        },
      }),
    ).toContain("obsidian://open");
    expect(listGranolaExportTargetDefinitions().length).toBeGreaterThan(0);
  });

  it("exports config loading", async () => {
    const config = await loadConfig({
      env: {},
      globalFlags: {},
      subcommandFlags: {},
    });

    expect(config.notes.output.length).toBeGreaterThan(0);
  });

  it("exports the Yazd agent bridge", async () => {
    const plugin = createGranolaYazdAgentPlugin({
      config: {
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
      },
      provider: "codex",
      runner: {
        async run() {
          return {
            dryRun: false,
            model: "gpt-5-codex",
            output: "ok",
            prompt: "ignored",
            provider: "codex",
          };
        },
      },
    });

    const result = await plugin.run({ prompt: "Summarise this meeting." });
    expect(result.text).toBe("ok");
  });
});
