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

  test("treats reordered tags and folders as the same meeting state", () => {
    const previousState: MeetingSummaryRecord[] = [
      {
        createdAt: "2024-02-01T09:00:00Z",
        folders: [
          {
            createdAt: "2024-01-01T00:00:00Z",
            documentCount: 2,
            id: "folder-b",
            isFavourite: false,
            name: "Beta",
            updatedAt: "2024-02-02T09:00:00Z",
          },
          {
            createdAt: "2024-01-01T00:00:00Z",
            documentCount: 3,
            id: "folder-a",
            isFavourite: true,
            name: "Alpha",
            updatedAt: "2024-02-02T09:00:00Z",
          },
        ],
        id: "doc-order-1111",
        noteContentSource: "notes",
        tags: ["beta", "alpha"],
        title: "Order Test",
        transcriptLoaded: true,
        transcriptSegmentCount: 2,
        updatedAt: "2024-02-03T09:00:00Z",
      },
    ];
    const nextState: MeetingSummaryRecord[] = [
      {
        ...previousState[0]!,
        folders: [...previousState[0]!.folders].reverse(),
        tags: [...previousState[0]!.tags].reverse(),
      },
    ];

    const result = diffMeetingSummaries(previousState, nextState, 2);

    expect(result.summary.changedCount).toBe(0);
    expect(result.changes).toEqual([]);
  });
});
