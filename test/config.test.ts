import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "vite-plus/test";

import { loadConfig } from "../src/config.ts";

describe("loadConfig", () => {
  test("loads flat TOML config values", async () => {
    const directory = await mkdtemp(join(tmpdir(), "granola-toolkit-config-"));
    const configPath = join(directory, ".granola.toml");

    await writeFile(
      configPath,
      [
        "debug = true",
        'supabase = "/tmp/supabase.json"',
        'output = "./notes-out"',
        'timeout = "30s"',
        'cache-file = "/tmp/cache.json"',
        'transcript-output = "./transcripts-out"',
      ].join("\n"),
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
    expect(config.notes.output).toBe("./notes-out");
    expect(config.notes.timeoutMs).toBe(30_000);
    expect(config.transcripts.cacheFile).toBe("/tmp/cache.json");
    expect(config.transcripts.output).toBe("./transcripts-out");
  });

  test("throws a clean error when an explicit config file is missing", async () => {
    const configPath = join(tmpdir(), "granola-toolkit-missing-config.toml");

    await expect(
      loadConfig({
        env: { NODE_ENV: "test" },
        globalFlags: { config: configPath },
        subcommandFlags: {},
      }),
    ).rejects.toThrow(`config file not found: ${configPath}`);
  });
});
