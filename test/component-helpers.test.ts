import { describe, expect, test } from "vite-plus/test";

import type { GranolaMeetingBundle, MeetingRecord } from "../src/app/index.ts";
import {
  meetingContextSummary,
  metadataLines,
  workspaceBody,
} from "../src/web-app/component-helpers.ts";

function buildMeetingRecord(): MeetingRecord {
  return {
    meeting: {
      createdAt: "2026-04-02T09:00:27.200Z",
      folders: [],
      id: "not_rb5lnOO7NrzV95",
      noteContentSource: "content",
      tags: [],
      title: "Payment Ops",
      transcriptLoaded: true,
      transcriptSegmentCount: 413,
      updatedAt: "2026-04-02T09:31:15.077Z",
    },
    note: {
      content: "Adyen Go-Live Status\n\n- Road to production delayed",
      contentSource: "content",
      createdAt: "2026-04-02T09:00:27.200Z",
      id: "not_rb5lnOO7NrzV95",
      tags: [],
      title: "Payment Ops",
      updatedAt: "2026-04-02T09:31:15.077Z",
    },
    noteMarkdown:
      "---\nid: not_rb5lnOO7NrzV95\ncreated: 2026-04-02T09:00:27.200Z\nupdated: 2026-04-02T09:31:15.077Z\n---\n\n# Payment Ops\n\nAdyen Go-Live Status\n\n- Road to production delayed\n",
    roleHelpers: {
      ownerCandidates: [],
      participants: [],
      speakers: [],
    },
    transcript: null,
    transcriptText: null,
  };
}

function buildMeetingBundle(record: MeetingRecord): GranolaMeetingBundle {
  return {
    meeting: record,
    source: {
      document: {
        content: "",
        createdAt: "2026-04-02T09:00:27.200Z",
        folderMemberships: [
          {
            id: "folder-super",
            name: "Super",
          },
        ],
        id: "not_rb5lnOO7NrzV95",
        notesPlain: "",
        tags: [],
        title: "Payment Ops",
        updatedAt: "2026-04-02T09:31:15.077Z",
      },
    },
  } as unknown as GranolaMeetingBundle;
}

describe("web meeting helpers", () => {
  test("uses bundle folder memberships when projected folders are missing", () => {
    const record = buildMeetingRecord();
    const bundle = buildMeetingBundle(record);

    expect(meetingContextSummary(record, bundle)).toBe(
      "2026-04-02 • Super • 413 transcript segments",
    );
    expect(metadataLines(record, bundle)).toContain("Folders: Super");
  });

  test("uses note content for the reader view instead of export markdown", () => {
    const record = buildMeetingRecord();
    const bundle = buildMeetingBundle(record);
    const notesView = workspaceBody(bundle, record, "notes");

    expect(notesView.body).toBe("Adyen Go-Live Status\n\n- Road to production delayed");
    expect(notesView.body).not.toContain("id:");
    expect(notesView.body).not.toContain("# Payment Ops");
  });
});
