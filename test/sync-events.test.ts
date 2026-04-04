import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileSyncEventStore } from "../src/sync-events.ts";

describe("FileSyncEventStore", () => {
  test("appends and reads events in reverse chronological order", async () => {
    const filePath = join(await mkdtemp(join(tmpdir(), "granola-sync-events-")), "events.jsonl");
    const store = new FileSyncEventStore(filePath);

    await store.appendEvents([
      {
        folders: [],
        id: "sync-1:1",
        kind: "meeting.created",
        meetingId: "doc-alpha-1111",
        occurredAt: "2024-03-01T12:00:00.000Z",
        runId: "sync-1",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: false,
        updatedAt: "2024-01-03T10:00:00Z",
      },
      {
        folders: [],
        id: "sync-1:2",
        kind: "transcript.ready",
        meetingId: "doc-alpha-1111",
        occurredAt: "2024-03-01T12:00:00.000Z",
        runId: "sync-1",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: true,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    expect(await store.readEvents(10)).toEqual([
      expect.objectContaining({
        id: "sync-1:2",
      }),
      expect.objectContaining({
        id: "sync-1:1",
      }),
    ]);
  });
});
