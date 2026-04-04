import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileExportJobStore } from "../src/export-jobs.ts";

describe("FileExportJobStore", () => {
  test("round-trips export jobs to disk", async () => {
    const filePath = join(await mkdtemp(join(tmpdir(), "granola-export-jobs-")), "jobs.json");
    const store = new FileExportJobStore(filePath);

    await store.writeJobs([
      {
        completedCount: 1,
        finishedAt: "2024-03-01T12:00:10Z",
        format: "markdown",
        id: "notes-1",
        itemCount: 1,
        kind: "notes",
        outputDir: "/tmp/notes",
        scope: { mode: "all" },
        startedAt: "2024-03-01T12:00:00Z",
        status: "completed",
        written: 1,
      },
    ]);

    expect(await store.readJobs()).toEqual([
      expect.objectContaining({
        completedCount: 1,
        id: "notes-1",
        kind: "notes",
        scope: { mode: "all" },
        status: "completed",
      }),
    ]);

    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain('"version": 1');
    expect(raw).toContain('"id": "notes-1"');
  });
});
