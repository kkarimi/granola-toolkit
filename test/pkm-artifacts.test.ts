import { describe, expect, test } from "vite-plus/test";

import { buildMeetingRecord } from "../src/meetings.ts";
import { buildMeetingPkmArtifactBundle } from "../src/pkm-artifacts.ts";
import type { GranolaAutomationArtefact, GranolaMeetingBundle } from "../src/app/index.ts";
import type { CacheData, GranolaDocument } from "../src/types.ts";

const document: GranolaDocument = {
  calendarEvent: {
    startTime: "2026-04-08T09:30:00Z",
  },
  content: "Fallback body",
  createdAt: "2026-04-08T09:00:00Z",
  folderMemberships: [
    {
      id: "fol-team",
      name: "Team",
    },
  ],
  id: "doc-alpha-1111",
  notes: {
    content: [
      {
        content: [
          {
            text: "Ship the launch plan.",
            type: "text",
          },
        ],
        type: "paragraph",
      },
    ],
    type: "doc",
  },
  notesPlain: "",
  people: {
    attendees: [
      {
        companyName: "Acme",
        email: "alex@example.com",
        name: "Alex",
        title: "PM",
      },
    ],
  },
  tags: ["launch", "team"],
  title: "Launch Review",
  updatedAt: "2026-04-08T10:00:00Z",
};

const cacheData: CacheData = {
  documents: {
    "doc-alpha-1111": {
      createdAt: "2026-04-08T09:00:00Z",
      id: "doc-alpha-1111",
      title: "Launch Review",
      updatedAt: "2026-04-08T10:00:00Z",
    },
  },
  transcripts: {
    "doc-alpha-1111": [
      {
        documentId: "doc-alpha-1111",
        endTimestamp: "2026-04-08T09:30:07Z",
        id: "seg-1",
        isFinal: true,
        source: "microphone",
        startTimestamp: "2026-04-08T09:30:01Z",
        text: "We should ship next Tuesday.",
      },
    ],
  },
};

const folders = [
  {
    createdAt: "2026-04-08T08:00:00Z",
    documentCount: 1,
    id: "fol-team",
    isFavourite: true,
    name: "Team",
    updatedAt: "2026-04-08T10:00:00Z",
    workspaceId: "workspace-1",
  },
];

function buildBundle(): GranolaMeetingBundle {
  return {
    meeting: buildMeetingRecord(document, cacheData, folders),
    source: {
      cacheDocument: cacheData.documents["doc-alpha-1111"],
      document,
    },
  };
}

describe("pkm artifacts", () => {
  test("builds canonical PKM artifacts from a meeting bundle", () => {
    const bundle = buildMeetingPkmArtifactBundle(buildBundle());

    expect(bundle.meeting).toEqual(
      expect.objectContaining({
        id: "doc-alpha-1111",
        meetingDate: "2026-04-08",
        title: "Launch Review",
      }),
    );
    expect(bundle.note).toEqual(
      expect.objectContaining({
        content: "Ship the launch plan.",
        kind: "meeting-note",
        markdown: "Ship the launch plan.",
        title: "Launch Review",
      }),
    );
    expect(bundle.transcript).toEqual(
      expect.objectContaining({
        kind: "transcript",
        segmentCount: 1,
        speakers: ["You"],
      }),
    );
    expect(bundle.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Team",
          type: "folder",
        }),
        expect.objectContaining({
          label: "launch",
          type: "tag",
        }),
        expect.objectContaining({
          email: "alex@example.com",
          label: "Alex",
          type: "person",
        }),
        expect.objectContaining({
          label: "Acme",
          type: "company",
        }),
      ]),
    );
    expect(bundle.decisions).toEqual([]);
    expect(bundle.actionItems).toEqual([]);
  });

  test("folds approved automation outputs into PKM decisions and action items", () => {
    const artefact: GranolaAutomationArtefact = {
      actionId: "pipeline-notes",
      actionName: "Pipeline notes",
      attempts: [],
      createdAt: "2026-04-08T10:05:00Z",
      eventId: "meeting.created:doc-alpha-1111",
      history: [],
      id: "artefact-1",
      kind: "notes",
      matchId: "match-1",
      meetingId: "doc-alpha-1111",
      model: "gpt-5",
      parseMode: "json",
      prompt: "Write structured notes",
      provider: "openai",
      rawOutput: "{}",
      ruleId: "review-notes",
      ruleName: "Review notes",
      runId: "run-1",
      status: "approved",
      structured: {
        actionItems: [
          {
            dueDate: "2026-04-12",
            owner: "Alex",
            ownerEmail: "alex@example.com",
            ownerRole: "attendee",
            title: "Draft the launch email",
          },
        ],
        decisions: ["Ship on Tuesday"],
        followUps: [],
        highlights: [],
        markdown: "# Launch Review\n\nApproved draft.",
        metadata: {
          companies: ["Acme"],
        },
        participantSummaries: [
          {
            actionItems: ["Draft the launch email"],
            role: "attendee",
            speaker: "Alex",
            summary: "Owns launch comms.",
          },
        ],
        sections: [],
        summary: "Approved draft",
        title: "Launch Review",
      },
      updatedAt: "2026-04-08T10:06:00Z",
    };

    const bundle = buildMeetingPkmArtifactBundle(buildBundle(), {
      artefacts: [artefact],
    });

    expect(bundle.decisions).toEqual([
      expect.objectContaining({
        kind: "decision",
        provenance: expect.objectContaining({
          reviewStatus: "approved",
          sourceKind: "automation-artefact",
        }),
        text: "Ship on Tuesday",
      }),
    ]);
    expect(bundle.actionItems).toEqual([
      expect.objectContaining({
        dueDate: "2026-04-12",
        kind: "action-item",
        owner: "Alex",
        ownerEmail: "alex@example.com",
        title: "Draft the launch email",
      }),
    ]);
    expect(bundle.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Alex",
          type: "person",
        }),
        expect.objectContaining({
          label: "Acme",
          type: "company",
        }),
      ]),
    );
  });
});
