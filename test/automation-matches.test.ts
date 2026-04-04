import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileAutomationMatchStore } from "../src/automation-matches.ts";

describe("FileAutomationMatchStore", () => {
  test("appends and reads matches in reverse chronological order", async () => {
    const filePath = join(
      await mkdtemp(join(tmpdir(), "granola-automation-matches-")),
      "matches.jsonl",
    );
    const store = new FileAutomationMatchStore(filePath);

    await store.appendMatches([
      {
        eventId: "sync-1:1",
        eventKind: "meeting.created",
        folders: [],
        id: "sync-1:1:rule-a",
        matchedAt: "2024-03-01T12:00:00.000Z",
        meetingId: "doc-alpha-1111",
        ruleId: "rule-a",
        ruleName: "Rule A",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: false,
      },
      {
        eventId: "sync-1:2",
        eventKind: "transcript.ready",
        folders: [],
        id: "sync-1:2:rule-b",
        matchedAt: "2024-03-01T12:01:00.000Z",
        meetingId: "doc-alpha-1111",
        ruleId: "rule-b",
        ruleName: "Rule B",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: true,
      },
    ]);

    expect(await store.readMatches(10)).toEqual([
      expect.objectContaining({ id: "sync-1:2:rule-b" }),
      expect.objectContaining({ id: "sync-1:1:rule-a" }),
    ]);
  });
});
