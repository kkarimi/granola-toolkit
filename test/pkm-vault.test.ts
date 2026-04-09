import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { buildMeetingRecord } from "../src/meetings.ts";
import { syncMarkdownVaultTarget } from "../src/pkm-vault.ts";
import type {
  GranolaAutomationArtefact,
  GranolaAutomationMatch,
  GranolaMeetingBundle,
  GranolaPkmTarget,
} from "../src/app/index.ts";
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

const match: GranolaAutomationMatch = {
  eventId: "sync-1:1",
  eventKind: "meeting.changed",
  folders: [
    {
      createdAt: "2026-04-08T08:00:00Z",
      documentCount: 1,
      id: "fol-team",
      isFavourite: true,
      name: "Team",
      updatedAt: "2026-04-08T10:00:00Z",
    },
  ],
  id: "match-1",
  matchedAt: "2026-04-08T10:07:00Z",
  meetingId: "doc-alpha-1111",
  ruleId: "rule-1",
  ruleName: "Rule",
  tags: ["team"],
  title: "Launch Review",
  transcriptLoaded: true,
};

describe("pkm vault target", () => {
  test("writes linked note and transcript files for docs folders", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "gran-pkm-vault-"));
    const target: GranolaPkmTarget = {
      folderSubdirectories: true,
      id: "docs-team",
      kind: "docs-folder",
      outputDir,
    };

    const result = await syncMarkdownVaultTarget({
      artefact,
      bundle: buildBundle(),
      match,
      target,
    });

    expect(result.filePath).toBe(join(outputDir, "Meetings", "Team", "Launch Review-notes.md"));
    expect(result.transcriptFilePath).toBe(
      join(outputDir, "Transcripts", "Team", "Launch Review-transcript.md"),
    );

    const note = await readFile(result.filePath, "utf8");
    const transcript = await readFile(result.transcriptFilePath!, "utf8");

    expect(note).toContain("[Transcript](../../Transcripts/Team/Launch Review-transcript.md)");
    expect(note).toContain("## Decisions");
    expect(note).toContain("## Action items");
    expect(note).toContain("## Entities");
    expect(transcript).toContain("[Launch Review](../../Meetings/Team/Launch Review-notes.md)");
    expect(transcript).toContain("## Transcript");
  });
});
