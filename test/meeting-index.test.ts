import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileMeetingIndexStore } from "../src/meeting-index.ts";

describe("FileMeetingIndexStore", () => {
  test("round-trips indexed meeting summaries to disk", async () => {
    const filePath = join(await mkdtemp(join(tmpdir(), "granola-meeting-index-")), "index.json");
    const store = new FileMeetingIndexStore(filePath);

    await store.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team", "alpha"],
        title: "Alpha Sync",
        transcriptLoaded: true,
        transcriptSegmentCount: 3,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    expect(await store.readIndex()).toEqual([
      expect.objectContaining({
        id: "doc-alpha-1111",
        transcriptSegmentCount: 3,
      }),
    ]);

    const persisted = await readFile(filePath, "utf8");
    expect(persisted).toContain('"version": 1');
    expect(persisted).toContain('"title": "Alpha Sync"');
  });
});
