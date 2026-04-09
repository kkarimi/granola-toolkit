import { writeFileSync } from "node:fs";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { MemoryAgentHarnessStore } from "../src/agent-harnesses.ts";
import { GranolaApp } from "../src/app/core.ts";
import { MemoryAutomationArtefactStore } from "../src/automation-artefacts.ts";
import { MemoryAutomationMatchStore } from "../src/automation-matches.ts";
import { MemoryAutomationRunStore } from "../src/automation-runs.ts";
import { MemoryAutomationRuleStore } from "../src/automation-rules.ts";
import { MemoryExportTargetStore } from "../src/export-targets.ts";
import { MemoryPkmTargetStore } from "../src/pkm-targets.ts";
import type { GranolaAppStateEvent } from "../src/app/index.ts";
import { MemorySyncEventStore } from "../src/sync-events.ts";
import { createGranolaServerClient } from "../src/server/client.ts";
import { startGranolaServer } from "../src/server/http.ts";
import { GRANOLA_TRANSPORT_PROTOCOL_VERSION } from "../src/transport.ts";
import type { CacheData, GranolaDocument, GranolaFolder } from "../src/types.ts";

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

const folders: GranolaFolder[] = [
  {
    createdAt: "2024-01-01T08:00:00Z",
    documentIds: ["doc-alpha-1111"],
    id: "folder-team-1111",
    isFavourite: true,
    name: "Team",
    updatedAt: "2024-01-04T10:00:00Z",
    workspaceId: "workspace-1",
  },
];

function enableAutomationConfig() {
  return {
    enabled: {
      automation: true,
      "markdown-viewer": true,
    },
    settingsFile: "/tmp/plugins.json",
    sources: {
      automation: "config" as const,
      "markdown-viewer": "default" as const,
    },
  };
}

function createTestApp(options: { withCacheFile?: boolean } = {}): {
  app: GranolaApp;
  setDocuments: (nextDocuments: GranolaDocument[]) => void;
} {
  let currentDocuments = documents;
  const cacheFile = "/tmp/granola-server-client-cache.json";
  if (options.withCacheFile) {
    writeFileSync(cacheFile, `${JSON.stringify(cacheData)}\n`, "utf8");
  }

  return {
    app: new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile: options.withCacheFile ? cacheFile : "",
          output: "/tmp/transcripts",
        },
      },
      {
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        agentHarnessStore: new MemoryAgentHarnessStore([
          {
            id: "team-harness",
            match: {
              tags: ["team"],
              transcriptLoaded: true,
            },
            name: "Team harness",
            prompt: "Write concise team notes.",
            provider: "codex",
          },
        ]),
        agentRunner: {
          run: async (request) => ({
            dryRun: false,
            model: request.model ?? "gpt-5-codex",
            output: JSON.stringify({
              actionItems: [],
              decisions: [],
              followUps: [],
              highlights: [],
              markdown: "# Evaluated Notes",
              sections: [{ body: "Done.", title: "Summary" }],
              summary: "Evaluation summary",
              title: "Evaluated Notes",
            }),
            prompt: request.prompt,
            provider: request.provider ?? "codex",
          }),
        },
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRunStore: new MemoryAutomationRunStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                id: "review",
                kind: "ask-user",
                prompt: "Review the meeting before sharing it",
              },
            ],
            id: "meeting-created-any",
            name: "Meeting created",
            when: {
              eventKinds: ["meeting.created"],
            },
          },
        ]),
        automationArtefacts: [
          {
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
            id: "notes:sync-1:pipeline-notes",
            kind: "notes",
            matchId: "sync-1:meeting-created-any",
            meetingId: "doc-alpha-1111",
            model: "gpt-5-codex",
            parseMode: "json",
            prompt: "Prompt",
            provider: "codex",
            rawOutput: "{}",
            ruleId: "meeting-created-any",
            ruleName: "Meeting created",
            runId: "sync-1:meeting-created-any:pipeline-notes",
            status: "generated",
            structured: {
              actionItems: [],
              decisions: [],
              followUps: [],
              highlights: [],
              markdown: "# Alpha Sync",
              sections: [],
              summary: "Generated summary",
              title: "Alpha Sync Notes",
            },
            updatedAt: "2024-03-01T12:00:00.000Z",
          },
        ],
        exportTargetStore: new MemoryExportTargetStore([
          {
            id: "archive",
            kind: "bundle-folder",
            outputDir: "/tmp/archive",
          },
        ]),
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => currentDocuments,
          listFolders: async () => folders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
        syncEventStore: new MemorySyncEventStore(),
      },
      { surface: "server" },
    ),
    setDocuments(nextDocuments) {
      currentDocuments = nextDocuments;
    },
  };
}

function waitForStateUpdate(
  subscribe: (listener: (event: GranolaAppStateEvent) => void) => () => void,
  predicate: (event: GranolaAppStateEvent) => boolean,
): Promise<GranolaAppStateEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("timed out waiting for a server event"));
    }, 2_000);

    const unsubscribe = subscribe((event) => {
      if (!predicate(event)) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
}

describe("GranolaServerClient", () => {
  let closeClient: (() => Promise<void>) | undefined;
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeClient?.();
    await closeServer?.();
    closeClient = undefined;
    closeServer = undefined;
  });

  test("attaches to the shared server state and receives live updates", async () => {
    const { app, setDocuments } = createTestApp();
    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const client = await createGranolaServerClient(server.url);
    closeClient = async () => await client.close();

    expect(client.info).toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          attach: true,
          folders: true,
          webClient: false,
        }),
        product: "gran",
        protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
      }),
    );
    expect(client.getState().ui.surface).toBe("server");

    const eventPromise = waitForStateUpdate(
      (listener) => client.subscribe(listener),
      (event) => event.state.documents.loaded,
    );

    const meetings = await client.listMeetings({
      folderId: "folder-team-1111",
      limit: 5,
      search: "alpha",
    });
    expect(meetings).toEqual(
      expect.objectContaining({
        meetings: [expect.objectContaining({ id: "doc-alpha-1111" })],
        source: "live",
      }),
    );

    const folderList = await client.listFolders({ limit: 10 });
    expect(folderList.folders[0]).toEqual(
      expect.objectContaining({
        id: "folder-team-1111",
        name: "Team",
      }),
    );

    const folder = await client.findFolder("Team");
    expect(folder.meetings[0]?.id).toBe("doc-alpha-1111");

    const event = await eventPromise;
    expect(event.state.documents.loaded).toBe(true);

    setDocuments([
      ...documents,
      {
        content: "Beta note body",
        createdAt: "2024-01-05T09:00:00Z",
        id: "doc-beta-2222",
        notes: {
          content: [
            {
              content: [{ text: "Beta notes", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        },
        notesPlain: "",
        tags: ["ops"],
        title: "Beta Review",
        updatedAt: "2024-01-06T10:00:00Z",
      },
    ]);
    await app.sync();
    const syncEvents = await client.listSyncEvents({ limit: 5 });
    expect(syncEvents.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "meeting.created",
          meetingId: "doc-beta-2222",
        }),
      ]),
    );
    expect(await client.listAutomationRules()).toEqual(
      expect.objectContaining({
        rules: [expect.objectContaining({ id: "meeting-created-any" })],
      }),
    );
    expect(
      await client.saveAutomationRules([
        {
          actions: [
            {
              approvalMode: "manual",
              harnessId: "team-harness",
              id: "starter-pipeline",
              kind: "agent",
              name: "Generate starter notes",
              pipeline: {
                kind: "notes",
              },
            },
          ],
          id: "starter-rule",
          name: "Starter Rule",
          when: {
            eventKinds: ["transcript.ready"],
            transcriptLoaded: true,
          },
        },
      ]),
    ).toEqual(
      expect.objectContaining({
        rules: [expect.objectContaining({ id: "starter-rule" })],
      }),
    );
    expect(await client.listAutomationMatches({ limit: 5 })).toEqual(
      expect.objectContaining({
        matches: [expect.objectContaining({ ruleId: "meeting-created-any" })],
      }),
    );
    const automationRuns = await client.listAutomationRuns({ limit: 5 });
    expect(automationRuns).toEqual(
      expect.objectContaining({
        runs: [
          expect.objectContaining({
            actionId: "review",
            status: "pending",
          }),
        ],
      }),
    );
    const resolvedRun = await client.resolveAutomationRun(automationRuns.runs[0]!.id, "approve", {
      note: "Approved in test",
    });
    expect(resolvedRun).toEqual(
      expect.objectContaining({
        result: "Approved in test",
        status: "completed",
      }),
    );

    const artefacts = await client.listAutomationArtefacts({ limit: 5 });
    expect(artefacts.artefacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "notes:sync-1:pipeline-notes",
          status: "generated",
        }),
      ]),
    );
    const updatedArtefact = await client.updateAutomationArtefact("notes:sync-1:pipeline-notes", {
      markdown: "# Alpha Sync\n\nReviewed in test",
      note: "Trimmed boilerplate",
      summary: "Reviewed summary",
      title: "Alpha Sync Notes (Reviewed)",
    });
    expect(updatedArtefact).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({
            action: "edited",
            note: "Trimmed boilerplate",
          }),
        ]),
        structured: expect.objectContaining({
          title: "Alpha Sync Notes (Reviewed)",
        }),
      }),
    );
    const approvedArtefact = await client.resolveAutomationArtefact(
      "notes:sync-1:pipeline-notes",
      "approve",
      {
        note: "Looks good",
      },
    );
    expect(approvedArtefact).toEqual(
      expect.objectContaining({
        status: "approved",
      }),
    );
    expect(await client.getAutomationArtefact("notes:sync-1:pipeline-notes")).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({
            action: "approved",
            note: "Looks good",
          }),
        ]),
        structured: expect.objectContaining({
          markdown: "# Alpha Sync\n\nReviewed in test",
        }),
      }),
    );
    const processingIssues = await client.listProcessingIssues({ limit: 5 });
    expect(processingIssues.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "transcript-missing",
        }),
      ]),
    );
    const transcriptIssue = processingIssues.issues.find(
      (issue) => issue.kind === "transcript-missing",
    );
    expect(await client.recoverProcessingIssue(transcriptIssue!.id)).toEqual(
      expect.objectContaining({
        issue: expect.objectContaining({
          id: transcriptIssue!.id,
          kind: "transcript-missing",
        }),
        syncRan: true,
      }),
    );

    const meeting = await client.findMeeting("Alpha Sync");
    expect(meeting).toEqual(
      expect.objectContaining({
        meeting: expect.objectContaining({
          noteMarkdown: expect.stringContaining("# Alpha Sync"),
        }),
        source: expect.objectContaining({
          document: expect.objectContaining({
            id: "doc-alpha-1111",
          }),
        }),
      }),
    );
  });

  test("exposes the Yazd source seam over the attached server", async () => {
    const { app } = createTestApp();
    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const client = await createGranolaServerClient(server.url);
    closeClient = async () => await client.close();

    await app.sync();

    expect(await client.inspectYazdSource()).toEqual(
      expect.objectContaining({
        id: "gran",
        label: "Gran",
        product: "gran",
      }),
    );

    const items = await client.listYazdSourceItems({ limit: 5, search: "alpha" });
    expect(items).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "doc-alpha-1111",
            title: "Alpha Sync",
            transcriptLoaded: false,
          }),
        ],
        source: "index",
      }),
    );

    expect(await client.fetchYazdSourceItem("doc-alpha-1111")).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          id: "doc-alpha-1111",
          title: "Alpha Sync",
        }),
        markdown: expect.stringContaining("Alpha notes"),
      }),
    );

    const artifacts = await client.buildYazdSourceArtifacts("doc-alpha-1111");
    expect(artifacts).toEqual(
      expect.objectContaining({
        sourceItemId: "doc-alpha-1111",
        sourcePluginId: "gran",
      }),
    );
    expect(artifacts.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "note" }),
        expect.objectContaining({ kind: "entity", text: "Team" }),
      ]),
    );

    const changes = await client.listYazdSourceChanges({ limit: 10 });
    expect(changes.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "doc-alpha-1111",
          kind: "created",
        }),
      ]),
    );
  });

  test("manages harnesses and evaluations through the attached server", async () => {
    const { app } = createTestApp({ withCacheFile: true });
    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const client = await createGranolaServerClient(server.url);
    closeClient = async () => await client.close();

    await expect(client.listAgentHarnesses()).resolves.toEqual({
      harnesses: [
        expect.objectContaining({
          id: "team-harness",
          name: "Team harness",
        }),
      ],
    });

    await expect(client.listExportTargets()).resolves.toEqual({
      targets: [
        expect.objectContaining({
          id: "archive",
          kind: "bundle-folder",
        }),
      ],
    });

    await expect(
      client.saveExportTargets([
        {
          id: "work-vault",
          kind: "obsidian-vault",
          outputDir: "/tmp/vault",
        },
      ]),
    ).resolves.toEqual({
      targets: [
        expect.objectContaining({
          id: "work-vault",
          kind: "obsidian-vault",
        }),
      ],
    });

    await expect(
      client.saveAgentHarnesses([
        {
          id: "team-harness",
          match: {
            tags: ["team"],
            transcriptLoaded: true,
          },
          model: "gpt-5-codex",
          name: "Team harness",
          prompt: "Write concise team notes.",
          provider: "openrouter",
        },
      ]),
    ).resolves.toEqual({
      harnesses: [
        expect.objectContaining({
          id: "team-harness",
          provider: "openrouter",
        }),
      ],
    });

    await expect(client.explainAgentHarnesses("doc-alpha-1111")).resolves.toEqual(
      expect.objectContaining({
        eventKind: "transcript.ready",
        harnesses: [
          expect.objectContaining({
            matched: true,
            harness: expect.objectContaining({ id: "team-harness" }),
          }),
        ],
        meetingId: "doc-alpha-1111",
      }),
    );

    const bundle = await client.getMeeting("doc-alpha-1111", { requireCache: true });
    await expect(
      client.evaluateAutomationCases(
        [
          {
            bundle,
            id: "eval-alpha",
            title: "Alpha Sync",
          },
        ],
        {
          harnessIds: ["team-harness"],
          kind: "notes",
          model: "gpt-5-codex",
          provider: "openrouter",
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: "notes",
        results: [
          expect.objectContaining({
            caseId: "eval-alpha",
            harnessId: "team-harness",
            model: "gpt-5-codex",
            provider: "openrouter",
            status: "completed",
            structured: expect.objectContaining({
              markdown: "# Evaluated Notes",
              title: "Evaluated Notes",
            }),
          }),
        ],
      }),
    );
  });

  test("exposes PKM publish previews and target-aware approval through the attached server", async () => {
    const docsDir = "/tmp/gran-server-client-pkm-docs";
    const obsidianDir = "/tmp/gran-server-client-pkm-obsidian";
    const automationArtefactStore = new MemoryAutomationArtefactStore();
    const automationMatchStore = new MemoryAutomationMatchStore();
    await automationArtefactStore.writeArtefacts([
      {
        actionId: "team-notes-pipeline",
        actionName: "Team notes",
        attempts: [],
        createdAt: "2024-03-01T12:00:00.000Z",
        eventId: "sync-1",
        history: [
          {
            action: "generated",
            at: "2024-03-01T12:00:00.000Z",
          },
        ],
        id: "notes:sync-1:team-notes-pipeline",
        kind: "notes",
        matchId: "sync-1:team-transcript",
        meetingId: "doc-alpha-1111",
        model: "gpt-5-codex",
        parseMode: "json",
        prompt: "Write team notes",
        provider: "codex",
        rawOutput: "{}",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        runId: "sync-1:team-transcript:team-notes-pipeline",
        status: "generated",
        structured: {
          actionItems: [],
          decisions: [],
          followUps: [],
          highlights: [],
          markdown: "# Team Notes\n\nReady for PKM review.",
          sections: [],
          summary: "Ready for PKM review",
          title: "Team Notes",
        },
        updatedAt: "2024-03-01T12:00:00.000Z",
      },
    ]);
    await automationMatchStore.appendMatches([
      {
        eventId: "sync-1",
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
        id: "sync-1:team-transcript",
        matchedAt: "2024-03-01T12:00:00.000Z",
        meetingId: "doc-alpha-1111",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        tags: ["team", "alpha"],
        title: "Alpha Sync",
        transcriptLoaded: true,
      },
    ]);

    const app = new GranolaApp(
      {
        automation: {
          artefactsFile: "/tmp/automation-artefacts.json",
          pkmTargetsFile: "/tmp/pkm-targets.json",
          rulesFile: "/tmp/automation-rules.json",
        },
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        plugins: enableAutomationConfig(),
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile: "",
          output: "/tmp/transcripts",
        },
      },
      {
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        automationArtefactStore,
        automationMatchStore,
        automationRunStore: new MemoryAutomationRunStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                approvalMode: "manual",
                id: "team-notes-pipeline",
                kind: "agent",
                pipeline: {
                  kind: "notes",
                },
                prompt: "Write team notes",
              },
              {
                id: "team-docs-sync",
                kind: "pkm-sync",
                sourceActionId: "team-notes-pipeline",
                targetId: "team-docs",
                trigger: "approval",
              },
              {
                id: "team-vault-sync",
                kind: "pkm-sync",
                sourceActionId: "team-notes-pipeline",
                targetId: "team-vault",
                trigger: "approval",
              },
            ],
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              folderNames: ["Team"],
              transcriptLoaded: true,
            },
          },
        ]),
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
        pkmTargetStore: new MemoryPkmTargetStore([
          {
            folderSubdirectories: true,
            id: "team-docs",
            kind: "docs-folder",
            name: "Team Docs",
            outputDir: docsDir,
          },
          {
            dailyNotesDir: "Daily",
            folderSubdirectories: true,
            id: "team-vault",
            kind: "obsidian",
            name: "Team Vault",
            outputDir: obsidianDir,
            vaultName: "Work",
          },
        ]),
      },
      { surface: "server" },
    );

    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const client = await createGranolaServerClient(server.url);
    closeClient = async () => await client.close();

    await expect(client.listPkmTargets()).resolves.toEqual({
      targets: expect.arrayContaining([
        expect.objectContaining({ id: "team-docs" }),
        expect.objectContaining({ id: "team-vault" }),
      ]),
    });

    const artefact = (await client.listAutomationArtefacts({ limit: 10 })).artefacts[0];
    expect(artefact).toBeDefined();

    await expect(
      client.previewAutomationArtefactPublish(artefact!.id, {
        targetId: "team-vault",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        artefactId: artefact!.id,
        selectedTargetId: "team-vault",
        targets: expect.arrayContaining([
          expect.objectContaining({ id: "team-docs" }),
          expect.objectContaining({ id: "team-vault" }),
        ]),
        preview: expect.objectContaining({
          dailyNoteFilePath: `${obsidianDir}/Daily/2024-01-01.md`,
          noteFilePath: `${obsidianDir}/Meetings/Team/Alpha Sync-notes.md`,
        }),
      }),
    );

    await expect(
      client.resolveAutomationArtefact(artefact!.id, "approve", {
        note: "Ship to docs",
        targetId: "team-docs",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "approved",
      }),
    );

    const runs = await client.listAutomationRuns({ limit: 10 });
    expect(runs.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "team-docs-sync",
          artefactIds: [artefact!.id],
          status: "completed",
        }),
      ]),
    );
    expect(runs.runs.map((run) => run.actionId)).not.toContain("team-vault-sync");
  });

  test("supports password-protected attach flows", async () => {
    const { app } = createTestApp();
    const server = await startGranolaServer(app, {
      security: {
        password: "secret-pass",
      },
    });
    closeServer = async () => await server.close();

    await expect(createGranolaServerClient(server.url)).rejects.toThrow("server password required");

    const client = await createGranolaServerClient(server.url, {
      password: "secret-pass",
    });
    closeClient = async () => await client.close();

    const meeting = await client.getMeeting("doc-alpha");
    expect(meeting.source.document.id).toBe("doc-alpha-1111");
  });
});
