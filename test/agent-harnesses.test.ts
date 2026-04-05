import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  FileAgentHarnessStore,
  matchAgentHarnesses,
  resolveAgentHarness,
} from "../src/agent-harnesses.ts";
import type { GranolaAutomationMatch, GranolaMeetingBundle } from "../src/app/index.ts";

const match: GranolaAutomationMatch = {
  eventId: "sync-1:1",
  eventKind: "transcript.ready",
  folders: [
    {
      createdAt: "2024-01-01T08:00:00Z",
      documentCount: 1,
      id: "folder-team-1111",
      isFavourite: true,
      name: "Team",
      updatedAt: "2024-01-04T10:00:00Z",
    },
  ],
  id: "match-1",
  matchedAt: "2024-03-01T12:00:00.000Z",
  meetingId: "doc-alpha-1111",
  ruleId: "rule-1",
  ruleName: "Team transcript ready",
  tags: ["team", "customer"],
  title: "Alpha Sync",
  transcriptLoaded: true,
};

const bundle: GranolaMeetingBundle = {
  document: {
    calendarEvent: {
      id: "event-123",
      recurringEventId: "recurring-456",
    },
    content: "",
    createdAt: "2024-01-01T09:00:00Z",
    id: "doc-alpha-1111",
    notesPlain: "Existing notes",
    tags: ["team", "customer"],
    title: "Alpha Sync",
    updatedAt: "2024-01-03T10:00:00Z",
  },
  meeting: {
    meeting: {
      createdAt: "2024-01-01T09:00:00Z",
      folders: match.folders,
      id: "doc-alpha-1111",
      noteContentSource: "notes",
      tags: ["team", "customer"],
      title: "Alpha Sync",
      transcriptLoaded: true,
      transcriptSegmentCount: 1,
      updatedAt: "2024-01-03T10:00:00Z",
    },
    note: {
      content: "Existing notes",
      contentSource: "notes",
      createdAt: "2024-01-01T09:00:00Z",
      id: "doc-alpha-1111",
      tags: ["team", "customer"],
      title: "Alpha Sync",
      updatedAt: "2024-01-03T10:00:00Z",
    },
    noteMarkdown: "# Alpha Sync",
    roleHelpers: {
      ownerCandidates: [{ id: "self", label: "You", role: "self", source: "speaker" }],
      participants: [],
      speakers: [
        {
          firstTimestamp: "2024-01-01T09:00:01Z",
          id: "speaker:you",
          label: "You",
          lastTimestamp: "2024-01-01T09:00:05Z",
          role: "self",
          segmentCount: 1,
          source: "microphone",
          wordCount: 5,
        },
      ],
    },
    transcript: null,
    transcriptText: "Customer asked about rollout timing.",
  },
};

describe("agent harnesses", () => {
  test("loads harness definitions from JSON", async () => {
    const filePath = join(
      await mkdtemp(join(tmpdir(), "granola-agent-harnesses-")),
      "harnesses.json",
    );
    await writeFile(
      filePath,
      `${JSON.stringify({
        harnesses: [
          {
            id: "customer-call",
            match: {
              recurringEventIds: ["recurring-456"],
              tags: ["customer"],
            },
            name: "Customer call",
            promptFile: "./agents/customer-call/AGENT.md",
            provider: "openrouter",
          },
        ],
      })}\n`,
      "utf8",
    );

    const store = new FileAgentHarnessStore(filePath);
    expect(await store.readHarnesses()).toEqual([
      expect.objectContaining({
        id: "customer-call",
        match: expect.objectContaining({
          recurringEventIds: ["recurring-456"],
          tags: ["customer"],
        }),
        name: "Customer call",
        promptFile: "./agents/customer-call/AGENT.md",
        provider: "openrouter",
      }),
    ]);
  });

  test("matches recurring meeting harnesses against meeting metadata", () => {
    const harnesses = [
      {
        id: "customer-call",
        match: {
          recurringEventIds: ["recurring-456"],
          tags: ["customer"],
        },
        name: "Customer call",
        promptFile: "./agents/customer-call/AGENT.md",
        provider: "openrouter" as const,
      },
      {
        id: "fallback",
        name: "Fallback",
        prompt: "Write generic notes.",
        provider: "codex" as const,
      },
    ];

    const matches = matchAgentHarnesses(harnesses, {
      bundle,
      match,
    });

    expect(matches.map((harness) => harness.id)).toEqual(["customer-call", "fallback"]);
    expect(
      resolveAgentHarness(harnesses, {
        bundle,
        match,
      }),
    ).toEqual(expect.objectContaining({ id: "customer-call" }));
  });
});
