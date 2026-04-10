import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "vite-plus/test";

import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("loads flat JSON config values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-config-"));
    const configPath = join(directory, "config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          "agent-dry-run": true,
          "agent-harnesses-file": "./agent-harnesses.json",
          "agent-max-retries": 4,
          "agent-model": "openai/gpt-5-mini",
          "agent-provider": "openrouter",
          "agent-timeout": "45s",
          "cache-file": "/tmp/cache.json",
          "codex-command": "codex-beta",
          debug: true,
          hooks: [
            {
              args: ["./scripts/gran-hook.mjs"],
              cwd: "./hooks",
              env: {
                PROFILE: "test",
              },
              events: ["transcript.ready"],
              id: "notify-script",
              run: "./bin/node",
            },
            {
              events: ["meeting.created"],
              headers: {
                authorization: "Bearer token",
              },
              id: "notify-webhook",
              url: "http://127.0.0.1:4124/hooks/gran",
            },
          ],
          output: "./notes-out",
          supabase: "/tmp/supabase.json",
          timeout: "30s",
          "transcript-output": "./transcripts-out",
        },
        null,
        2,
      ),
      "utf8",
    );

    const config = await loadConfig({
      env: { NODE_ENV: "test" },
      globalFlags: { config: configPath },
      subcommandFlags: {},
    });

    expect(config.configFileUsed).toBe(configPath);
    expect(config.debug).toBe(true);
    expect(config.supabase).toBe("/tmp/supabase.json");
    expect(config.notes.output).toBe(join(directory, "notes-out"));
    expect(config.notes.timeoutMs).toBe(30_000);
    expect(config.transcripts.cacheFile).toBe("/tmp/cache.json");
    expect(config.transcripts.output).toBe(join(directory, "transcripts-out"));
    expect(config.agents).toEqual(
      expect.objectContaining({
        codexCommand: "codex-beta",
        defaultModel: "openai/gpt-5-mini",
        defaultProvider: "openrouter",
        dryRun: true,
        harnessesFile: join(directory, "agent-harnesses.json"),
        maxRetries: 4,
        timeoutMs: 45_000,
      }),
    );
    expect(config.hooks).toEqual({
      items: [
        {
          args: ["./scripts/gran-hook.mjs"],
          cwd: join(directory, "hooks"),
          env: {
            PROFILE: "test",
          },
          events: ["transcript.ready"],
          id: "notify-script",
          kind: "script",
          run: join(directory, "bin/node"),
        },
        {
          events: ["meeting.created"],
          headers: {
            authorization: "Bearer token",
          },
          id: "notify-webhook",
          kind: "webhook",
          url: "http://127.0.0.1:4124/hooks/gran",
        },
      ],
    });
  });

  test("throws a clean error when an explicit config file is missing", async () => {
    const configPath = join(tmpdir(), "gran-missing-config.json");

    await expect(
      loadConfig({
        env: { NODE_ENV: "test" },
        globalFlags: { config: configPath },
        subcommandFlags: {},
      }),
    ).rejects.toThrow(`config file not found: ${configPath}`);
  });

  test("auto-discovers a project-local .gran/config.json", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-config-project-"));
    const granDirectory = join(directory, ".gran");
    const configPath = join(granDirectory, "config.json");
    const originalCwd = process.cwd();

    await mkdir(granDirectory, { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify(
        {
          debug: true,
          output: "../exports/notes",
        },
        null,
        2,
      ),
      "utf8",
    );

    process.chdir(directory);
    try {
      const config = await loadConfig({
        env: { NODE_ENV: "test" },
        globalFlags: {},
        subcommandFlags: {},
      });

      expect(config.configFileUsed).toMatch(/\/\.gran\/config\.json$/);
      expect(config.debug).toBe(true);
      expect(config.notes.output).toMatch(/\/exports\/notes$/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
