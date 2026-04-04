import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileSyncStateStore } from "../src/sync-state.ts";

describe("FileSyncStateStore", () => {
  test("round-trips persisted sync state to disk", async () => {
    const filePath = join(await mkdtemp(join(tmpdir(), "granola-sync-state-")), "sync.json");
    const store = new FileSyncStateStore(filePath);

    await store.writeState({
      filePath,
      lastChanges: [
        {
          kind: "created",
          meetingId: "doc-alpha-1111",
          title: "Alpha Sync",
          updatedAt: "2024-01-03T10:00:00Z",
        },
      ],
      lastCompletedAt: "2024-03-01T12:00:00.000Z",
      lastStartedAt: "2024-03-01T11:59:59.000Z",
      running: true,
      summary: {
        changedCount: 0,
        createdCount: 1,
        folderCount: 1,
        meetingCount: 1,
        removedCount: 0,
        transcriptReadyCount: 0,
      },
    });

    expect(await store.readState()).toEqual({
      filePath,
      lastChanges: [
        {
          kind: "created",
          meetingId: "doc-alpha-1111",
          title: "Alpha Sync",
          updatedAt: "2024-01-03T10:00:00Z",
        },
      ],
      lastCompletedAt: "2024-03-01T12:00:00.000Z",
      lastStartedAt: "2024-03-01T11:59:59.000Z",
      running: false,
      summary: {
        changedCount: 0,
        createdCount: 1,
        folderCount: 1,
        meetingCount: 1,
        removedCount: 0,
        transcriptReadyCount: 0,
      },
    });

    expect(await readFile(filePath, "utf8")).toContain('"version": 1');
  });
});
