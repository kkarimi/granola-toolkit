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
      eventCount: 1,
      eventsFile: "/tmp/sync-events.jsonl",
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
      lastRunId: "sync-20240301120000",
      lastStartedAt: "2024-03-01T11:59:59.000Z",
      recentRuns: [
        {
          changeCount: 1,
          changes: [
            {
              kind: "created",
              meetingId: "doc-alpha-1111",
              title: "Alpha Sync",
              updatedAt: "2024-01-03T10:00:00Z",
            },
          ],
          completedAt: "2024-03-01T12:00:00.000Z",
          id: "sync-20240301120000",
          startedAt: "2024-03-01T11:59:59.000Z",
          status: "succeeded",
          summary: {
            changedCount: 0,
            createdCount: 1,
            folderCount: 1,
            meetingCount: 1,
            removedCount: 0,
            transcriptReadyCount: 0,
          },
        },
      ],
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
      eventCount: 1,
      eventsFile: "/tmp/sync-events.jsonl",
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
      lastRunId: "sync-20240301120000",
      lastStartedAt: "2024-03-01T11:59:59.000Z",
      recentRuns: [
        {
          changeCount: 1,
          changes: [
            {
              kind: "created",
              meetingId: "doc-alpha-1111",
              title: "Alpha Sync",
              updatedAt: "2024-01-03T10:00:00Z",
            },
          ],
          completedAt: "2024-03-01T12:00:00.000Z",
          id: "sync-20240301120000",
          startedAt: "2024-03-01T11:59:59.000Z",
          status: "succeeded",
          summary: {
            changedCount: 0,
            createdCount: 1,
            folderCount: 1,
            meetingCount: 1,
            removedCount: 0,
            transcriptReadyCount: 0,
          },
        },
      ],
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
