import { describe, expect, it } from "vitest";

import {
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
});
