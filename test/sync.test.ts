import { describe, expect, test } from "vite-plus/test";

import type { MeetingSummaryRecord } from "../src/app/index.ts";
import { diffMeetingSummaries } from "../src/sync.ts";

const previous: MeetingSummaryRecord[] = [
  {
    createdAt: "2024-01-01T09:00:00Z",
    folders: [],
    id: "doc-alpha-1111",
    noteContentSource: "notes",
    tags: ["team"],
    title: "Alpha Sync",
    transcriptLoaded: false,
    transcriptSegmentCount: 0,
    updatedAt: "2024-01-03T10:00:00Z",
  },
  {
    createdAt: "2024-01-02T09:00:00Z",
    folders: [],
    id: "doc-legacy-3333",
    noteContentSource: "content",
    tags: [],
    title: "Legacy Review",
    transcriptLoaded: false,
    transcriptSegmentCount: 0,
    updatedAt: "2024-01-02T10:00:00Z",
  },
];

const next: MeetingSummaryRecord[] = [
  {
    createdAt: "2024-01-01T09:00:00Z",
    folders: [],
    id: "doc-alpha-1111",
    noteContentSource: "notes",
    tags: ["team"],
    title: "Alpha Sync",
    transcriptLoaded: true,
    transcriptSegmentCount: 3,
    updatedAt: "2024-01-03T10:00:00Z",
  },
  {
    createdAt: "2024-01-05T09:00:00Z",
    folders: [],
    id: "doc-beta-2222",
    noteContentSource: "notes",
    tags: ["ops"],
    title: "Beta Review",
    transcriptLoaded: true,
    transcriptSegmentCount: 1,
    updatedAt: "2024-01-06T10:00:00Z",
  },
];

describe("diffMeetingSummaries", () => {
  test("reports created, changed, removed, and transcript-ready events", () => {
    const result = diffMeetingSummaries(previous, next, 2);

    expect(result.summary).toEqual({
      changedCount: 1,
      createdCount: 1,
      folderCount: 2,
      meetingCount: 2,
      removedCount: 1,
      transcriptReadyCount: 2,
    });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "changed",
          meetingId: "doc-alpha-1111",
        }),
        expect.objectContaining({
          kind: "transcript-ready",
          meetingId: "doc-alpha-1111",
        }),
        expect.objectContaining({
          kind: "created",
          meetingId: "doc-beta-2222",
        }),
        expect.objectContaining({
          kind: "removed",
          meetingId: "doc-legacy-3333",
        }),
      ]),
    );
  });
});
