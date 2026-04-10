import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileAutomationArtefactStore } from "../src/automation-artefacts.ts";
import type { GranolaAutomationArtefact } from "../src/app/index.ts";

function buildArtefact(
  id: string,
  overrides: Partial<GranolaAutomationArtefact> = {},
): GranolaAutomationArtefact {
  return {
    actionId: "pipeline-notes",
    actionName: "Pipeline notes",
    attempts: [],
    createdAt: "2024-03-01T12:00:00.000Z",
    eventId: "sync-1",
    history: [
      {
        action: "generated",
        at: "2024-03-01T12:00:00.000Z",
      },
    ],
    id,
    kind: "notes",
    matchId: "sync-1:team-transcript",
    meetingId: "doc-alpha-1111",
    model: "gpt-5-codex",
    parseMode: "json",
    prompt: "Prompt",
    provider: "codex",
    rawOutput: '{"title":"Alpha"}',
    ruleId: "team-transcript",
    ruleName: "Team transcript ready",
    runId: "sync-1:team-transcript:pipeline-notes",
    status: "generated",
    structured: {
      actionItems: [],
      decisions: [],
      followUps: [],
      highlights: [],
      markdown: "# Alpha",
      sections: [{ body: "Alpha body", title: "Summary" }],
      summary: "Alpha body",
      title: "Alpha",
    },
    updatedAt: "2024-03-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("automation artefact store", () => {
  test("writes and filters artefacts", async () => {
    const filePath = join(
      await mkdtemp(join(tmpdir(), "granola-automation-artefacts-")),
      "artefacts.json",
    );
    const store = new FileAutomationArtefactStore(filePath);

    await store.writeArtefacts([
      buildArtefact("notes-1"),
      buildArtefact("enrichment-1", {
        kind: "enrichment",
        meetingId: "doc-beta-2222",
        status: "approved",
        updatedAt: "2024-03-01T13:00:00.000Z",
      }),
    ]);

    expect(await store.readArtefact("notes-1")).toEqual(
      expect.objectContaining({
        id: "notes-1",
        kind: "notes",
      }),
    );
    expect(await store.readArtefacts({ kind: "enrichment", limit: 10 })).toEqual([
      expect.objectContaining({
        id: "enrichment-1",
      }),
    ]);
    expect(
      await store.readArtefacts({
        meetingId: "doc-alpha-1111",
        status: "generated",
      }),
    ).toEqual([
      expect.objectContaining({
        id: "notes-1",
      }),
    ]);
  });

  test("preserves participant summaries when artefacts round-trip through disk", async () => {
    const filePath = join(
      await mkdtemp(join(tmpdir(), "granola-automation-artefacts-")),
      "artefacts.json",
    );
    const store = new FileAutomationArtefactStore(filePath);

    await store.writeArtefacts([
      buildArtefact("notes-1", {
        structured: {
          actionItems: [],
          decisions: [],
          followUps: [],
          highlights: [],
          markdown: "# Alpha",
          participantSummaries: [
            {
              actionItems: ["Follow up with ops"],
              role: "attendee",
              speaker: "Nima",
              summary: "Asked for a rollout plan",
            },
          ],
          sections: [{ body: "Alpha body", title: "Summary" }],
          summary: "Alpha body",
          title: "Alpha",
        },
      }),
    ]);

    expect((await store.readArtefact("notes-1"))?.structured.participantSummaries).toEqual([
      {
        actionItems: ["Follow up with ops"],
        role: "attendee",
        speaker: "Nima",
        summary: "Asked for a rollout plan",
      },
    ]);
  });

  test("normalises shared artifact attempts and parse modes from disk", async () => {
    const filePath = join(
      await mkdtemp(join(tmpdir(), "granola-automation-artefacts-")),
      "artefacts.json",
    );
    const store = new FileAutomationArtefactStore(filePath);

    await writeFile(
      filePath,
      JSON.stringify({
        artefacts: [
          {
            ...buildArtefact("notes-1"),
            attempts: [
              {
                model: "gpt-5",
                provider: "unsupported-provider",
              },
            ],
          },
          {
            ...buildArtefact("notes-invalid", {
              parseMode: "json",
            }),
            parseMode: "xml",
          },
        ],
        version: 1,
      }),
      "utf8",
    );

    expect((await store.readArtefact("notes-1"))?.attempts).toEqual([
      {
        model: "gpt-5",
        provider: undefined,
      },
    ]);
    expect(await store.readArtefact("notes-invalid")).toBeUndefined();
  });
});
