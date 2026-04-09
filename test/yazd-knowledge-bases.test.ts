import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  buildGranolaAutomationKnowledgeBaseBundle,
  buildGranolaYazdKnowledgeBaseRef,
  previewGranolaYazdKnowledgeBasePublishSync,
  publishGranolaYazdKnowledgeBase,
} from "../src/yazd-knowledge-bases.ts";
import { buildMeetingRecord } from "../src/meetings.ts";
import type {
  GranolaAutomationArtefact,
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

function buildBundle(): GranolaMeetingBundle {
  return {
    meeting: buildMeetingRecord(document, cacheData, folders),
    source: {
      cacheDocument: cacheData.documents["doc-alpha-1111"],
      document,
    },
  };
}

describe("yazd knowledge bases", () => {
  test("previews publish entries from an automation artifact bundle", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "gran-yazd-preview-"));
    const knowledgeBase = buildGranolaYazdKnowledgeBaseRef({
      dailyNotesDir: "Daily",
      folderSubdirectories: true,
      id: "obsidian-team",
      kind: "obsidian",
      outputDir,
      vaultName: "Work",
    } satisfies GranolaPkmTarget);

    const preview = previewGranolaYazdKnowledgeBasePublishSync({
      bundle: buildGranolaAutomationKnowledgeBaseBundle({
        artefact,
        bundle: buildBundle(),
      }),
      knowledgeBase,
    });

    expect(preview.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactKind: "note",
          path: join(outputDir, "Meetings", "Team", "Launch Review-notes.md"),
        }),
        expect.objectContaining({
          artifactKind: "transcript",
          path: join(outputDir, "Meeting Transcripts", "Team", "Launch Review-transcript.md"),
        }),
        expect.objectContaining({
          artifactKind: "daily-note",
          path: join(outputDir, "Daily", "2026-04-08.md"),
        }),
      ]),
    );
  });

  test("publishes note, transcript, and daily-note files through the Yazd knowledge-base seam", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "gran-yazd-publish-"));
    const knowledgeBase = buildGranolaYazdKnowledgeBaseRef({
      dailyNotesDir: "Daily",
      folderSubdirectories: true,
      id: "obsidian-team",
      kind: "obsidian",
      outputDir,
      vaultName: "Work",
    } satisfies GranolaPkmTarget);

    const result = await publishGranolaYazdKnowledgeBase({
      bundle: buildGranolaAutomationKnowledgeBaseBundle({
        artefact,
        bundle: buildBundle(),
      }),
      knowledgeBase,
    });

    expect(result.writtenCount).toBeGreaterThan(0);

    const notePath = join(outputDir, "Meetings", "Team", "Launch Review-notes.md");
    const transcriptPath = join(
      outputDir,
      "Meeting Transcripts",
      "Team",
      "Launch Review-transcript.md",
    );
    const dailyNotePath = join(outputDir, "Daily", "2026-04-08.md");

    expect(await readFile(notePath, "utf8")).toContain("# Launch Review");
    expect(await readFile(notePath, "utf8")).toContain("## Decisions");
    expect(await readFile(transcriptPath, "utf8")).toContain("## Transcript");
    expect(await readFile(dailyNotePath, "utf8")).toContain(
      "[[Meetings/Team/Launch Review-notes]]",
    );
  });
});
