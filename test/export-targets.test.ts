import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileExportTargetStore } from "../src/export-targets.ts";

describe("export targets", () => {
  test("loads targets from a JSON file", async () => {
    const filePath = join(await mkdtemp(join(tmpdir(), "granola-export-targets-")), "targets.json");
    const store = new FileExportTargetStore(filePath);

    await store.writeTargets([
      {
        id: "archive",
        kind: "bundle-folder",
        notesSubdir: "notes",
        outputDir: "/tmp/archive",
        transcriptsSubdir: "transcripts",
      },
      {
        dailyNotesDir: "Daily",
        id: "work-vault",
        kind: "obsidian-vault",
        name: "Work vault",
        notesFormat: "markdown",
        outputDir: "/tmp/vault",
        transcriptsFormat: "markdown",
      },
    ]);

    expect(await store.readTargets()).toEqual([
      expect.objectContaining({
        id: "archive",
        kind: "bundle-folder",
      }),
      expect.objectContaining({
        dailyNotesDir: "Daily",
        id: "work-vault",
        kind: "obsidian-vault",
        name: "Work vault",
        transcriptsFormat: "markdown",
      }),
    ]);
    expect(await readFile(filePath, "utf8")).toContain('"work-vault"');
  });
});
