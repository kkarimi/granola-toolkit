import { describe, expect, test } from "vite-plus/test";

import { buildSearchIndex, searchSearchIndex } from "../src/search-index.ts";
import type { GranolaAutomationArtefact } from "../src/app/types.ts";
import type { GranolaDocument } from "../src/types.ts";

const documents: GranolaDocument[] = [
  {
    content: "Fallback note body",
    createdAt: "2024-01-01T09:00:00Z",
    id: "doc-alpha-1111",
    notesPlain: "Discussed customer retention and onboarding timeline",
    tags: ["team", "customer"],
    title: "Alpha Sync",
    updatedAt: "2024-01-03T10:00:00Z",
  },
  {
    content: "Fallback note body",
    createdAt: "2024-01-02T09:00:00Z",
    id: "doc-bravo-2222",
    notesPlain: "Quarterly pipeline review",
    tags: ["sales"],
    title: "Bravo Review",
    updatedAt: "2024-01-04T10:00:00Z",
  },
];

const artefacts: GranolaAutomationArtefact[] = [
  {
    actionId: "pipeline-notes",
    actionName: "Pipeline Notes",
    attempts: [],
    createdAt: "2024-01-04T09:00:00Z",
    eventId: "sync-event-1",
    history: [],
    id: "notes:sync-event-1:pipeline-notes",
    kind: "notes",
    matchId: "match-1",
    meetingId: "doc-alpha-1111",
    model: "gpt-4.1",
    parseMode: "json",
    prompt: "Summarise the meeting",
    provider: "openai",
    rawOutput: '{"title":"Customer onboarding summary"}',
    ruleId: "rule-team-notes",
    ruleName: "Team Notes",
    runId: "run-1",
    status: "approved",
    structured: {
      actionItems: [{ owner: "Nima", title: "Follow up on onboarding checklist" }],
      decisions: ["Keep onboarding scope in the first release"],
      followUps: ["Draft the implementation plan"],
      highlights: ["Customer onboarding remains the main blocker"],
      markdown: "## Customer onboarding summary\n\nShip the onboarding checklist.",
      metadata: undefined,
      participantSummaries: [],
      sections: [{ body: "Ship the onboarding checklist.", title: "Outcome" }],
      summary: "Customer onboarding summary",
      title: "Customer onboarding summary",
    },
    updatedAt: "2024-01-04T09:05:00Z",
  },
  {
    actionId: "pipeline-notes",
    actionName: "Pipeline Notes",
    attempts: [],
    createdAt: "2024-01-05T09:00:00Z",
    eventId: "sync-event-2",
    history: [],
    id: "notes:sync-event-2:pipeline-notes",
    kind: "notes",
    matchId: "match-2",
    meetingId: "doc-bravo-2222",
    model: "gpt-4.1",
    parseMode: "json",
    prompt: "Summarise the meeting",
    provider: "openai",
    rawOutput: '{"title":"Rejected draft"}',
    ruleId: "rule-sales-notes",
    ruleName: "Sales Notes",
    runId: "run-2",
    status: "rejected",
    structured: {
      actionItems: [],
      decisions: [],
      followUps: [],
      highlights: [],
      markdown: "Rejected draft",
      metadata: undefined,
      participantSummaries: [],
      sections: [],
      summary: "Rejected draft",
      title: "Rejected draft",
    },
    updatedAt: "2024-01-05T09:05:00Z",
  },
];

describe("search index", () => {
  test("builds searchable entries with notes, transcripts, folders, tags, and artefacts", () => {
    const entries = buildSearchIndex(documents, {
      artefacts,
      cacheData: {
        documents: {},
        transcripts: {
          "doc-alpha-1111": [
            {
              documentId: "doc-alpha-1111",
              endTimestamp: "2024-01-01T09:00:03Z",
              id: "segment-1",
              isFinal: true,
              source: "microphone",
              startTimestamp: "2024-01-01T09:00:01Z",
              text: "Customer onboarding needs follow-up",
            },
          ],
        },
      },
      foldersByDocumentId: new Map([
        [
          "doc-alpha-1111",
          [
            {
              createdAt: "2024-01-01T08:00:00Z",
              documentCount: 1,
              id: "folder-team-1111",
              isFavourite: true,
              name: "Team",
              updatedAt: "2024-01-04T10:00:00Z",
            },
          ],
        ],
      ]),
    });

    expect(entries[0]).toEqual(
      expect.objectContaining({
        id: "doc-bravo-2222",
      }),
    );
    expect(entries[1]).toEqual(
      expect.objectContaining({
        artefactActionNames: ["Pipeline Notes"],
        artefactCount: 1,
        artefactRuleNames: ["Team Notes"],
        artefactTitles: ["Customer onboarding summary"],
        folderNames: ["Team"],
        transcriptLoaded: true,
      }),
    );
  });

  test("searches across note text, transcript text, folder names, tags, and artefacts", () => {
    const entries = buildSearchIndex(documents, {
      artefacts,
      cacheData: {
        documents: {},
        transcripts: {
          "doc-alpha-1111": [
            {
              documentId: "doc-alpha-1111",
              endTimestamp: "2024-01-01T09:00:03Z",
              id: "segment-1",
              isFinal: true,
              source: "microphone",
              startTimestamp: "2024-01-01T09:00:01Z",
              text: "Customer onboarding needs follow-up",
            },
          ],
        },
      },
      foldersByDocumentId: new Map([
        [
          "doc-alpha-1111",
          [
            {
              createdAt: "2024-01-01T08:00:00Z",
              documentCount: 1,
              id: "folder-team-1111",
              isFavourite: true,
              name: "Team",
              updatedAt: "2024-01-04T10:00:00Z",
            },
          ],
        ],
      ]),
    });

    expect(searchSearchIndex(entries, "customer onboarding")[0]).toEqual({
      id: "doc-alpha-1111",
      score: expect.any(Number),
    });
    expect(searchSearchIndex(entries, "retention")[0]?.id).toBe("doc-alpha-1111");
    expect(searchSearchIndex(entries, "checklist")[0]?.id).toBe("doc-alpha-1111");
    expect(searchSearchIndex(entries, "sales")[0]?.id).toBe("doc-bravo-2222");
    expect(searchSearchIndex(entries, "team")[0]?.id).toBe("doc-alpha-1111");
    expect(searchSearchIndex(entries, "rejected")).toEqual([]);
  });

  test("marks transcript availability from the shared meeting model even when known segments are empty", () => {
    const entries = buildSearchIndex(
      [
        {
          content: "Fallback note body",
          createdAt: "2024-01-06T09:00:00Z",
          id: "doc-empty-3333",
          notesPlain: "Transcript is known but empty",
          tags: ["ops"],
          title: "Empty Transcript",
          updatedAt: "2024-01-06T10:00:00Z",
        },
      ],
      {
        cacheData: {
          documents: {},
          transcripts: {
            "doc-empty-3333": [],
          },
        },
      },
    );

    expect(entries).toEqual([
      expect.objectContaining({
        id: "doc-empty-3333",
        transcriptLoaded: true,
        transcriptText: "",
      }),
    ]);
  });
});
