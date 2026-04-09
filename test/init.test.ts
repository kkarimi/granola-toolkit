import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "vite-plus/test";

import { initialiseGranolaToolkitProject, inspectGranolaToolkitProject } from "../src/init.ts";

describe("initialiseGranolaToolkitProject", () => {
  test("creates a local bootstrap with starter config, harnesses, rules, and prompts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-init-"));

    const result = await initialiseGranolaToolkitProject({
      directory,
      provider: "openrouter",
    });

    expect(result.configPath).toBe(join(directory, ".gran.json"));
    expect(result.createdFiles).toEqual([
      join(directory, ".gran.json"),
      join(directory, ".gran", "agent-harnesses.json"),
      join(directory, ".gran", "automation-rules.json"),
      join(directory, ".gran", "pkm-targets.json"),
      join(directory, ".gran", "prompts", "team-notes.md"),
      join(directory, ".gran", "prompts", "customer-follow-up.md"),
    ]);

    const configContents = await readFile(join(directory, ".gran.json"), "utf8");
    const harnessContents = await readFile(
      join(directory, ".gran", "agent-harnesses.json"),
      "utf8",
    );
    const rulesContents = await readFile(join(directory, ".gran", "automation-rules.json"), "utf8");

    expect(configContents).toContain('"agent-provider": "openrouter"');
    expect(configContents).toContain('"agent-model": "openai/gpt-5-mini"');
    expect(configContents).toContain('"agent-harnesses-file": "./.gran/agent-harnesses.json"');
    expect(harnessContents).toContain('"id": "team-notes"');
    expect(harnessContents).toContain('"promptFile": "./.gran/prompts/team-notes.md"');
    expect(rulesContents).toContain('"harnessId": "team-notes"');
    expect(rulesContents).toContain('"folderNames": [');
  });

  test("refuses to overwrite generated files unless forced", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-init-"));

    await initialiseGranolaToolkitProject({
      directory,
      provider: "codex",
    });

    await expect(
      initialiseGranolaToolkitProject({
        directory,
        provider: "codex",
      }),
    ).rejects.toThrow("init would overwrite existing files:");
  });

  test("inspects a complete existing bootstrap cleanly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-init-"));

    await initialiseGranolaToolkitProject({
      directory,
      provider: "codex",
    });

    const state = await inspectGranolaToolkitProject(directory);

    expect(state.directory).toBe(directory);
    expect(state.hasAnyFiles).toBe(true);
    expect(state.isComplete).toBe(true);
    expect(state.missingFiles).toEqual([]);
    expect(state.existingFiles).toHaveLength(6);
  });

  test("inspects a partial bootstrap so init can explain the problem", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-init-"));

    await initialiseGranolaToolkitProject({
      directory,
      provider: "codex",
    });
    await rm(join(directory, ".gran", "automation-rules.json"));

    const state = await inspectGranolaToolkitProject(directory);

    expect(state.hasAnyFiles).toBe(true);
    expect(state.isComplete).toBe(false);
    expect(state.missingFiles).toContain(join(directory, ".gran", "automation-rules.json"));
  });
});
