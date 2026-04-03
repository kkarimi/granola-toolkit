import { describe, expect, test } from "vite-plus/test";

import {
  buildMeetingRecord,
  listMeetings,
  renderMeetingExport,
  renderMeetingList,
  renderMeetingView,
  resolveMeeting,
} from "../src/meetings.ts";
import type { CacheData, GranolaDocument } from "../src/types.ts";

const documents: GranolaDocument[] = [
  {
    content: "Fallback note body",
    createdAt: "2024-01-01T09:00:00Z",
    id: "doc-alpha-1111",
    notes: {
      content: [
        {
          content: [{ text: "Alpha notes", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    notesPlain: "",
    tags: ["team", "alpha"],
    title: "Alpha Sync",
    updatedAt: "2024-01-03T10:00:00Z",
  },
  {
    content: "Bravo fallback",
    createdAt: "2024-02-01T09:00:00Z",
    id: "doc-bravo-2222",
    notesPlain: "",
    tags: ["sales"],
    title: "Bravo Review",
    updatedAt: "2024-02-05T12:00:00Z",
  },
  {
    content: "Charlie fallback",
    createdAt: "2024-02-02T09:00:00Z",
    id: "doc-charlie-3333",
    notesPlain: "",
    tags: ["sales", "ops"],
    title: "Charlie Pipeline",
    updatedAt: "2024-02-05T11:00:00Z",
  },
];

const cacheData: CacheData = {
  documents: {
    "doc-alpha-1111": {
      createdAt: "2024-01-01T09:00:00Z",
      id: "doc-alpha-1111",
      title: "Alpha Sync",
      updatedAt: "2024-01-03T10:00:00Z",
    },
  },
  transcripts: {
    "doc-alpha-1111": [
      {
        documentId: "doc-alpha-1111",
        endTimestamp: "2024-01-01T09:00:03Z",
        id: "segment-1",
        isFinal: true,
        source: "microphone",
        startTimestamp: "2024-01-01T09:00:01Z",
        text: "Hello team",
      },
    ],
  },
};

describe("listMeetings", () => {
  test("sorts meetings by latest update and filters by search", () => {
    const meetings = listMeetings(documents, {
      limit: 5,
      search: "sales",
    });

    expect(meetings).toHaveLength(2);
    expect(meetings.map((meeting) => meeting.id)).toEqual(["doc-bravo-2222", "doc-charlie-3333"]);
  });
});

describe("resolveMeeting", () => {
  test("resolves a meeting by unique prefix", () => {
    expect(resolveMeeting(documents, "doc-alpha").id).toBe("doc-alpha-1111");
  });

  test("throws when a meeting prefix is ambiguous", () => {
    expect(() => resolveMeeting(documents, "doc-")).toThrow("ambiguous meeting id");
  });

  test("throws when the meeting cannot be found", () => {
    expect(() => resolveMeeting(documents, "missing")).toThrow("meeting not found: missing");
  });
});

describe("meeting rendering", () => {
  test("builds a meeting record with transcript details when cache data is available", () => {
    const record = buildMeetingRecord(documents[0]!, cacheData);

    expect(record.meeting.transcriptLoaded).toBe(true);
    expect(record.meeting.transcriptSegmentCount).toBe(1);
    expect(record.note.contentSource).toBe("notes");
    expect(record.transcriptText).toContain("[09:00:01] You: Hello team");
  });

  test("renders meeting list and view text output", () => {
    const summary = listMeetings(documents, {
      cacheData,
      limit: 3,
    });
    const listText = renderMeetingList(summary, "text");
    const viewText = renderMeetingView(buildMeetingRecord(documents[0]!, cacheData), "text");

    expect(listText).toContain("TITLE");
    expect(listText).toContain("Alpha Sync");
    expect(viewText).toContain("# Alpha Sync");
    expect(viewText).toContain("## Notes");
    expect(viewText).toContain("Alpha notes");
    expect(viewText).toContain("## Transcript");
    expect(viewText).toContain("Hello team");
  });

  test("renders machine-readable export output", () => {
    const output = renderMeetingExport(buildMeetingRecord(documents[0]!, cacheData), "json");
    const parsed = JSON.parse(output) as {
      meeting: { id: string };
      noteMarkdown: string;
      transcriptText: string | null;
    };

    expect(parsed.meeting.id).toBe("doc-alpha-1111");
    expect(parsed.noteMarkdown).toContain("# Alpha Sync");
    expect(parsed.transcriptText).toContain("Hello team");
  });

  test("shows unloaded transcript state when cache data is unavailable", () => {
    const viewText = renderMeetingView(buildMeetingRecord(documents[1]!), "text");

    expect(viewText).toContain("Transcript: cache not loaded");
    expect(viewText).toContain("(Granola cache not loaded)");
  });
});
