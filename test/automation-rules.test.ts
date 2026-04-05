import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileAutomationRuleStore, matchAutomationRules } from "../src/automation-rules.ts";
import type { GranolaAppSyncEvent } from "../src/app/index.ts";

const events: GranolaAppSyncEvent[] = [
  {
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
    id: "sync-1:1",
    kind: "transcript.ready",
    meetingId: "doc-alpha-1111",
    occurredAt: "2024-03-01T12:00:00.000Z",
    runId: "sync-1",
    tags: ["team", "customer"],
    title: "Alpha Sync",
    transcriptLoaded: true,
    updatedAt: "2024-01-03T10:00:00Z",
  },
];

describe("automation rules", () => {
  test("matches rules against sync event metadata", () => {
    const matches = matchAutomationRules(
      [
        {
          id: "team-transcript",
          name: "Team transcript ready",
          when: {
            eventKinds: ["transcript.ready"],
            folderNames: ["Team"],
            tags: ["customer"],
            transcriptLoaded: true,
          },
        },
        {
          id: "ops-only",
          name: "Ops only",
          when: {
            eventKinds: ["meeting.created"],
            tags: ["ops"],
          },
        },
      ],
      events,
      "2024-03-01T12:00:00.000Z",
    );

    expect(matches).toEqual([
      expect.objectContaining({
        eventId: "sync-1:1",
        eventKind: "transcript.ready",
        meetingId: "doc-alpha-1111",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        title: "Alpha Sync",
      }),
    ]);
  });

  test("loads rules from a JSON file", async () => {
    const filePath = join(await mkdtemp(join(tmpdir(), "granola-automation-rules-")), "rules.json");
    await writeFile(
      filePath,
      `${JSON.stringify({
        rules: [
          {
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              folderNames: ["Team"],
            },
            actions: [
              {
                id: "note-export",
                kind: "export-notes",
                outputDir: "/tmp/notes",
                scopedOutput: true,
              },
              {
                id: "meeting-agent",
                harnessId: "customer-call",
                kind: "agent",
                model: "openai/gpt-5-mini",
                promptFile: "./AGENT.md",
                provider: "openrouter",
                retries: 3,
              },
            ],
          },
        ],
      })}\n`,
      "utf8",
    );

    const store = new FileAutomationRuleStore(filePath);
    expect(await store.readRules()).toEqual([
      expect.objectContaining({
        actions: [
          expect.objectContaining({
            id: "note-export",
            kind: "export-notes",
            outputDir: "/tmp/notes",
          }),
          expect.objectContaining({
            id: "meeting-agent",
            harnessId: "customer-call",
            kind: "agent",
            model: "openai/gpt-5-mini",
            promptFile: "./AGENT.md",
            provider: "openrouter",
            retries: 3,
          }),
        ],
        id: "team-transcript",
        name: "Team transcript ready",
      }),
    ]);
  });
});
