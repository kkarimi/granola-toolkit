import { describe, expect, test, vi } from "vite-plus/test";

import { createDefaultAutomationAgentRunner } from "../src/agents.ts";
import type { AppConfig } from "../src/types.ts";

function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...values,
  };
}

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

describe("automation agent runner", () => {
  test("supports dry-run requests without calling an external provider", async () => {
    const runCodexCommand = vi.fn();
    const runner = createDefaultAutomationAgentRunner(
      {
        ...createConfig(),
        agents: {
          ...createConfig().agents!,
          dryRun: true,
        },
      },
      {
        env: env(),
        runCodexCommand,
      },
    );

    const result = await runner.run({
      prompt: "Summarise this meeting",
    });

    expect(result).toEqual(
      expect.objectContaining({
        dryRun: true,
        model: "gpt-5-codex",
        prompt: "Summarise this meeting",
        provider: "codex",
      }),
    );
    expect(runCodexCommand).not.toHaveBeenCalled();
  });

  test("calls OpenRouter with chat completions", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      expect(requestUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer or_test_123");
      expect(headers.get("http-referer")).toBe("https://github.com/kkarimi/granola-toolkit");
      expect(headers.get("x-title")).toBe("granola-toolkit");
      expect(JSON.parse(init?.body as string)).toEqual({
        messages: [
          {
            content: "You write sharp meeting notes.",
            role: "system",
          },
          {
            content: "Summarise the transcript",
            role: "user",
          },
        ],
        model: "openai/gpt-5-mini",
      });

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Done",
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const runner = createDefaultAutomationAgentRunner(
      {
        ...createConfig(),
        agents: {
          ...createConfig().agents!,
          defaultProvider: "openrouter",
        },
      },
      {
        env: env({
          OPENROUTER_API_KEY: "or_test_123",
        }),
        fetchImpl,
      },
    );

    const result = await runner.run({
      model: "openai/gpt-5-mini",
      prompt: "Summarise the transcript",
      systemPrompt: "You write sharp meeting notes.",
    });

    expect(result).toEqual(
      expect.objectContaining({
        dryRun: false,
        model: "openai/gpt-5-mini",
        output: "Done",
        provider: "openrouter",
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("routes Codex requests through the local codex command", async () => {
    const runCodexCommand = vi.fn(async () => ({
      command: "codex exec --skip-git-repo-check",
      output: "Generated notes",
    }));
    const runner = createDefaultAutomationAgentRunner(createConfig(), {
      env: env(),
      runCodexCommand,
    });

    const result = await runner.run({
      cwd: "/tmp/workspace",
      model: "gpt-5-codex",
      prompt: "Summarise the transcript",
      systemPrompt: "Focus on decisions and follow-ups.",
    });

    expect(runCodexCommand).toHaveBeenCalledWith({
      command: "codex",
      cwd: "/tmp/workspace",
      model: "gpt-5-codex",
      prompt: "Focus on decisions and follow-ups.\n\nSummarise the transcript",
      timeoutMs: 30_000,
    });
    expect(result).toEqual(
      expect.objectContaining({
        command: "codex exec --skip-git-repo-check",
        output: "Generated notes",
        provider: "codex",
      }),
    );
  });
});
