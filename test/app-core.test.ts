import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import { MemoryAgentHarnessStore } from "../src/agent-harnesses.ts";
import { MemoryAutomationMatchStore } from "../src/automation-matches.ts";
import { MemoryAutomationRunStore } from "../src/automation-runs.ts";
import { MemoryAutomationRuleStore } from "../src/automation-rules.ts";
import { MemoryExportJobStore } from "../src/export-jobs.ts";
import { MemoryMeetingIndexStore } from "../src/meeting-index.ts";
import { MemorySearchIndexStore } from "../src/search-index.ts";
import { MemorySyncEventStore } from "../src/sync-events.ts";
import { MemorySyncStateStore } from "../src/sync-state.ts";
import type { GranolaAppAuthState } from "../src/app/index.ts";
import type { GranolaAutomationAgentRequest, GranolaAutomationAgentResult } from "../src/agents.ts";
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

describe("GranolaApp", () => {
  test("reuses loaded documents and cache across meeting operations", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const listDocuments = vi.fn(async () => documents);
    const loadCache = vi.fn(async () => cacheData);
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
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
        cacheLoader: loadCache,
        granolaClient: { listDocuments },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const list = await app.listMeetings({ limit: 10, search: "alpha" });
    const meeting = await app.getMeeting("doc-alpha");

    expect(list.meetings).toHaveLength(1);
    expect(list.source).toBe("live");
    expect(meeting.meeting.meeting.id).toBe("doc-alpha-1111");
    expect(meeting.meeting.transcriptText).toContain("Hello team");
    expect(listDocuments).toHaveBeenCalledTimes(1);
    expect(loadCache).toHaveBeenCalledTimes(1);
    expect(app.getState().ui).toEqual(
      expect.objectContaining({
        meetingSearch: "alpha",
        selectedMeetingId: "doc-alpha-1111",
        view: "meeting-detail",
      }),
    );
  });

  test("lists folders, resolves folder queries, and filters meetings by folder", async () => {
    const listDocuments = vi.fn(async () => documents);
    const listFolders = vi.fn(async () => folders);
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => cacheData,
        granolaClient: { listDocuments, listFolders },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const folderList = await app.listFolders({ limit: 10, search: "team" });
    const folder = await app.findFolder("Team");
    const meetings = await app.listMeetings({ folderId: folder.id, limit: 10 });
    const meeting = await app.getMeeting("doc-alpha-1111");

    expect(folderList.folders).toEqual([
      expect.objectContaining({
        id: "folder-team-1111",
        name: "Team",
      }),
    ]);
    expect(folder.meetings).toEqual([
      expect.objectContaining({
        id: "doc-alpha-1111",
      }),
    ]);
    expect(meetings.meetings).toHaveLength(1);
    expect(meeting.meeting.meeting.folders[0]?.id).toBe("folder-team-1111");
    expect(listFolders).toHaveBeenCalledTimes(1);
  });

  test("syncs the local meeting index and persists structured sync state", async () => {
    const meetingIndexStore = new MemoryMeetingIndexStore();
    const syncEventStore = new MemorySyncEventStore();
    const syncStateStore = new MemorySyncStateStore({
      filePath: "/tmp/granola-sync-state.json",
    });
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-sync-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    await meetingIndexStore.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
        folders: [],
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team", "alpha"],
        title: "Alpha Sync",
        transcriptLoaded: false,
        transcriptSegmentCount: 0,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    const syncedDocuments: GranolaDocument[] = [
      documents[0]!,
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
    ];

    const syncedFolders: GranolaFolder[] = [
      folders[0]!,
      {
        createdAt: "2024-01-05T08:00:00Z",
        documentIds: ["doc-beta-2222"],
        id: "folder-ops-2222",
        isFavourite: false,
        name: "Ops",
        updatedAt: "2024-01-06T10:00:00Z",
        workspaceId: "workspace-1",
      },
    ];

    const syncedCacheData: CacheData = {
      documents: {
        ...cacheData.documents,
        "doc-beta-2222": {
          createdAt: "2024-01-05T09:00:00Z",
          id: "doc-beta-2222",
          title: "Beta Review",
          updatedAt: "2024-01-06T10:00:00Z",
        },
      },
      transcripts: {
        ...cacheData.transcripts,
        "doc-beta-2222": [
          {
            documentId: "doc-beta-2222",
            endTimestamp: "2024-01-05T09:00:03Z",
            id: "segment-beta-1",
            isFinal: true,
            source: "microphone",
            startTimestamp: "2024-01-05T09:00:01Z",
            text: "Hello ops",
          },
        ],
      },
    };

    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
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
        cacheLoader: async () => syncedCacheData,
        granolaClient: {
          listDocuments: async () => syncedDocuments,
          listFolders: async () => syncedFolders,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
        syncEventStore,
        syncState: await syncStateStore.readState(),
        syncStateStore,
      },
      { surface: "server" },
    );

    const result = await app.sync();
    const syncEvents = await app.listSyncEvents({ limit: 10 });
    const persistedIndex = await meetingIndexStore.readIndex();
    const persistedSyncState = await syncStateStore.readState();

    expect(result.summary).toEqual({
      changedCount: 1,
      createdCount: 1,
      folderCount: 2,
      meetingCount: 2,
      removedCount: 0,
      transcriptReadyCount: 2,
    });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "changed",
          meetingId: "doc-alpha-1111",
        }),
        expect.objectContaining({
          kind: "transcript-ready",
          meetingId: "doc-alpha-1111",
        }),
        expect.objectContaining({
          kind: "created",
          meetingId: "doc-beta-2222",
        }),
      ]),
    );
    expect(persistedIndex).toHaveLength(2);
    expect(persistedSyncState.summary).toEqual(result.summary);
    expect(persistedSyncState.eventCount).toBe(syncEvents.events.length);
    expect(persistedSyncState.lastCompletedAt).toBe("2024-03-01T12:00:00.000Z");
    expect(syncEvents.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "meeting.created",
          meetingId: "doc-beta-2222",
        }),
        expect.objectContaining({
          kind: "transcript.ready",
          meetingId: "doc-alpha-1111",
        }),
      ]),
    );
    expect(app.getState().sync).toEqual(
      expect.objectContaining({
        eventCount: syncEvents.events.length,
        lastCompletedAt: "2024-03-01T12:00:00.000Z",
        running: false,
        summary: result.summary,
      }),
    );
    expect(app.getState().ui.view).toBe("sync");
  });

  test("uses the local search index for meeting list search and quick-open fallback", async () => {
    const meetingIndexStore = new MemoryMeetingIndexStore();
    const searchIndexStore = new MemorySearchIndexStore();
    const searchableDocuments: GranolaDocument[] = [
      {
        ...documents[0]!,
        notesPlain: "Customer onboarding timeline and retention risks",
      },
      {
        content: "Other note body",
        createdAt: "2024-01-02T09:00:00Z",
        id: "doc-bravo-2222",
        notes: {
          content: [
            {
              content: [{ text: "Quarterly pipeline review", type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        },
        notesPlain: "Quarterly pipeline review",
        tags: ["sales"],
        title: "Bravo Review",
        updatedAt: "2024-01-04T10:00:00Z",
      },
    ];
    const searchFolders: GranolaFolder[] = [
      folders[0]!,
      {
        createdAt: "2024-01-02T08:00:00Z",
        documentIds: ["doc-bravo-2222"],
        id: "folder-sales-2222",
        isFavourite: false,
        name: "Sales",
        updatedAt: "2024-01-05T10:00:00Z",
        workspaceId: "workspace-1",
      },
    ];

    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => searchableDocuments,
          listFolders: async () => searchFolders,
        },
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
        searchIndexStore,
      },
      { surface: "server" },
    );

    await app.sync();
    const searchResults = await app.listMeetings({
      limit: 10,
      preferIndex: true,
      search: "customer onboarding",
    });
    const meeting = await app.findMeeting("customer onboarding");

    expect(searchResults.source).toBe("index");
    expect(searchResults.meetings).toEqual([
      expect.objectContaining({
        id: "doc-alpha-1111",
      }),
    ]);
    expect(meeting.document.id).toBe("doc-alpha-1111");
    expect((await searchIndexStore.readIndex())[0]?.id).toBe("doc-bravo-2222");
  });

  test("matches automation rules from sync events", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const meetingIndexStore = new MemoryMeetingIndexStore();
    await meetingIndexStore.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
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
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: false,
        transcriptSegmentCount: 0,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    const matchStore = new MemoryAutomationMatchStore();
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
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
        automationMatchStore: matchStore,
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              folderNames: ["Team"],
              tags: ["team"],
              transcriptLoaded: true,
            },
          },
        ]),
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    await app.sync();
    const matches = await app.listAutomationMatches({ limit: 10 });

    expect(matches.matches).toEqual([
      expect.objectContaining({
        eventKind: "transcript.ready",
        meetingId: "doc-alpha-1111",
        ruleId: "team-transcript",
        title: "Alpha Sync",
      }),
    ]);
    expect(app.getState().automation).toEqual(
      expect.objectContaining({
        loaded: true,
        matchCount: 1,
        pendingRunCount: 0,
        ruleCount: 1,
        runCount: 0,
      }),
    );
  });

  test("executes automation actions from matched sync events and resolves pending runs", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const outputDir = await mkdtemp(join(tmpdir(), "granola-automation-export-"));
    const meetingIndexStore = new MemoryMeetingIndexStore();
    const matchStore = new MemoryAutomationMatchStore();
    const runStore = new MemoryAutomationRunStore();
    const runAgent = vi.fn(async (request: { prompt: string }) => ({
      dryRun: false,
      model: "gpt-5-codex",
      output: request.prompt.includes("Alpha Sync")
        ? "Agent summary for Alpha Sync"
        : "Agent summary",
      prompt: request.prompt,
      provider: "codex" as const,
    }));

    await meetingIndexStore.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
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
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: false,
        transcriptSegmentCount: 0,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: outputDir,
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
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
        automationMatchStore: matchStore,
        agentRunner: {
          run: runAgent,
        },
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                id: "meeting-agent",
                kind: "agent",
                prompt: "Rewrite this meeting into concise notes.",
                provider: "codex",
              },
              {
                id: "notes-export",
                kind: "export-notes",
                outputDir,
                scopedOutput: true,
              },
              {
                args: [
                  "-e",
                  "let data='';process.stdin.on('data',chunk=>data+=chunk);process.stdin.on('end',()=>{const input=JSON.parse(data);process.stdout.write(input.meeting.meeting.meeting.title);});",
                ],
                command: process.execPath,
                id: "prompt-command",
                kind: "command",
              },
              {
                id: "review",
                kind: "ask-user",
                prompt: "Review the new transcript before publishing it",
              },
            ],
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              folderNames: ["Team"],
              tags: ["team"],
              transcriptLoaded: true,
            },
          },
        ]),
        automationRunStore: runStore,
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    await app.sync();
    const runs = await app.listAutomationRuns({ limit: 10 });
    const markdown = await readFile(
      join(outputDir, "_meetings", "doc-alpha-1111", "Alpha Sync.md"),
      "utf8",
    );
    const pendingRun = runs.runs.find((run) => run.status === "pending");
    if (!pendingRun) {
      throw new Error("expected pending automation run");
    }

    expect(markdown).toContain("# Alpha Sync");
    expect(runs.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "meeting-agent",
          actionKind: "agent",
          result: "Agent summary for Alpha Sync",
          status: "completed",
        }),
        expect.objectContaining({
          actionId: "notes-export",
          actionKind: "export-notes",
          status: "completed",
        }),
        expect.objectContaining({
          actionId: "prompt-command",
          actionKind: "command",
          result: "Alpha Sync",
          status: "completed",
        }),
        expect.objectContaining({
          actionId: "review",
          actionKind: "ask-user",
          prompt: "Review the new transcript before publishing it",
          status: "pending",
        }),
      ]),
    );
    expect(app.getState().automation).toEqual(
      expect.objectContaining({
        matchCount: 1,
        pendingRunCount: 1,
        runCount: 4,
      }),
    );
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Transcript:"),
      }),
    );

    const resolved = await app.resolveAutomationRun(pendingRun.id, "approve", {
      note: "Approved from test",
    });

    expect(resolved.status).toBe("completed");
    expect(app.getState().automation.pendingRunCount).toBe(0);
    expect(await runStore.readRun(pendingRun.id)).toEqual(
      expect.objectContaining({
        result: "Approved from test",
        status: "completed",
      }),
    );
  });

  test("tracks note exports in application state", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-app-notes-"));
    const jobStore = new MemoryExportJobStore();
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: outputDir,
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => undefined,
        exportJobStore: jobStore,
        granolaClient: {
          listDocuments: async () => documents,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const result = await app.exportNotes("markdown");
    const markdown = await readFile(join(outputDir, "Alpha Sync.md"), "utf8");
    const state = app.getState();

    expect(result.documentCount).toBe(1);
    expect(result.job.status).toBe("completed");
    expect(result.scope).toEqual({ mode: "all" });
    expect(result.written).toBe(1);
    expect(markdown).toContain("# Alpha Sync");
    expect(state.exports.notes).toEqual(
      expect.objectContaining({
        format: "markdown",
        itemCount: 1,
        jobId: result.job.id,
        outputDir,
        scope: { mode: "all" },
        written: 1,
      }),
    );
    expect(state.exports.jobs[0]).toEqual(
      expect.objectContaining({
        completedCount: 1,
        id: result.job.id,
        kind: "notes",
        scope: { mode: "all" },
        status: "completed",
      }),
    );
    expect(await jobStore.readJobs()).toHaveLength(1);
    expect(state.ui.view).toBe("notes-export");
  });

  test("resolves agent harness instructions before running an automation agent", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const meetingIndexStore = new MemoryMeetingIndexStore();
    const runAgent = vi.fn(
      async (request: GranolaAutomationAgentRequest): Promise<GranolaAutomationAgentResult> => ({
        dryRun: false,
        model: "openai/gpt-5-mini",
        output: "Harness output",
        prompt: request.prompt,
        provider: request.provider ?? "openrouter",
      }),
    );

    await meetingIndexStore.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
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
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: false,
        transcriptSegmentCount: 0,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    const app = new GranolaApp(
      {
        agents: {
          codexCommand: "codex",
          defaultProvider: "codex",
          dryRun: false,
          harnessesFile: "/tmp/agent-harnesses.json",
          maxRetries: 2,
          openaiBaseUrl: "https://api.openai.com/v1",
          openrouterBaseUrl: "https://openrouter.ai/api/v1",
          timeoutMs: 30_000,
        },
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
          output: "/tmp/transcripts",
        },
      },
      {
        agentHarnessStore: new MemoryAgentHarnessStore([
          {
            id: "team-harness",
            match: {
              folderNames: ["Team"],
            },
            name: "Team harness",
            prompt: "Use the team harness for concise customer-facing notes.",
            provider: "openrouter",
          },
        ]),
        agentRunner: {
          run: runAgent,
        },
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                harnessId: "team-harness",
                id: "meeting-agent",
                kind: "agent",
              },
            ],
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              folderNames: ["Team"],
              tags: ["team"],
              transcriptLoaded: true,
            },
          },
        ]),
        automationRunStore: new MemoryAutomationRunStore(),
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    await app.sync();

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Use the team harness for concise customer-facing notes."),
        provider: "openrouter",
      }),
    );
  });

  test("exports folder-scoped notes into a stable folder output and reruns with the same scope", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-app-folder-notes-"));
    const jobStore = new MemoryExportJobStore();
    const scopedDocuments: GranolaDocument[] = [
      documents[0]!,
      {
        content: "Other note body",
        createdAt: "2024-01-02T09:00:00Z",
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
        tags: ["beta"],
        title: "Beta Review",
        updatedAt: "2024-01-04T10:00:00Z",
      },
    ];
    const scopedFolders: GranolaFolder[] = [
      folders[0]!,
      {
        createdAt: "2024-01-02T08:00:00Z",
        documentIds: ["doc-beta-2222"],
        id: "folder-ops-2222",
        isFavourite: false,
        name: "Ops",
        updatedAt: "2024-01-05T10:00:00Z",
        workspaceId: "workspace-1",
      },
    ];
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: outputDir,
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => undefined,
        exportJobStore: jobStore,
        granolaClient: {
          listDocuments: async () => scopedDocuments,
          listFolders: async () => scopedFolders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const first = await app.exportNotes("markdown", {
      folderId: "folder-team-1111",
    });
    const scopedOutputDir = join(outputDir, "_folders", "folder-team-1111");

    expect(first.scope).toEqual({
      folderId: "folder-team-1111",
      folderName: "Team",
      mode: "folder",
    });
    expect(first.outputDir).toBe(scopedOutputDir);
    expect(first.documentCount).toBe(1);
    expect(await readFile(join(scopedOutputDir, "Alpha Sync.md"), "utf8")).toContain(
      "# Alpha Sync",
    );

    const rerun = await app.rerunExportJob(first.job.id);
    expect("documentCount" in rerun).toBe(true);
    if ("documentCount" in rerun) {
      expect(rerun.scope).toEqual(first.scope);
      expect(rerun.outputDir).toBe(scopedOutputDir);
    }

    const jobs = await jobStore.readJobs();
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        outputDir: scopedOutputDir,
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
      }),
    );
  });

  test("exports folder-scoped transcripts into a stable folder output", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-app-folder-transcripts-"));
    const cacheFile = join(
      await mkdtemp(join(tmpdir(), "granola-app-folder-cache-")),
      "cache.json",
    );
    await writeFile(cacheFile, "{}\n", "utf8");
    const jobStore = new MemoryExportJobStore();
    const scopedCacheData: CacheData = {
      documents: {
        ...cacheData.documents,
        "doc-beta-2222": {
          createdAt: "2024-01-02T09:00:00Z",
          id: "doc-beta-2222",
          title: "Beta Review",
          updatedAt: "2024-01-04T10:00:00Z",
        },
      },
      transcripts: {
        ...cacheData.transcripts,
        "doc-beta-2222": [
          {
            documentId: "doc-beta-2222",
            endTimestamp: "2024-01-02T09:10:00Z",
            id: "segment-2",
            isFinal: true,
            source: "microphone",
            startTimestamp: "2024-01-02T09:09:00Z",
            text: "Hello ops",
          },
        ],
      },
    };
    const scopedFolders: GranolaFolder[] = [
      folders[0]!,
      {
        createdAt: "2024-01-02T08:00:00Z",
        documentIds: ["doc-beta-2222"],
        id: "folder-ops-2222",
        isFavourite: false,
        name: "Ops",
        updatedAt: "2024-01-05T10:00:00Z",
        workspaceId: "workspace-1",
      },
    ];
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
          output: outputDir,
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
        cacheLoader: async () => scopedCacheData,
        exportJobStore: jobStore,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => scopedFolders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const result = await app.exportTranscripts("text", {
      folderId: "folder-team-1111",
    });
    const scopedOutputDir = join(outputDir, "_folders", "folder-team-1111");

    expect(result.scope).toEqual({
      folderId: "folder-team-1111",
      folderName: "Team",
      mode: "folder",
    });
    expect(result.outputDir).toBe(scopedOutputDir);
    expect(result.transcriptCount).toBe(1);
    expect(await readFile(join(scopedOutputDir, "Alpha Sync.txt"), "utf8")).toContain("Hello team");
    expect(await jobStore.readJobs()).toEqual([
      expect.objectContaining({
        outputDir: scopedOutputDir,
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
      }),
    ]);
  });

  test("lists and reruns persisted export jobs", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-app-rerun-"));
    const jobStore = new MemoryExportJobStore();
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: outputDir,
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => undefined,
        exportJobStore: jobStore,
        granolaClient: {
          listDocuments: async () => documents,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const first = await app.exportNotes("markdown");
    const listed = await app.listExportJobs({ limit: 10 });
    const rerun = await app.rerunExportJob(first.job.id);

    expect(listed.jobs[0]?.id).toBe(first.job.id);
    expect("documentCount" in rerun).toBe(true);
    expect(rerun.job.id).not.toBe(first.job.id);
    expect(rerun.job.kind).toBe("notes");
    expect((await jobStore.readJobs()).map((job) => job.id)).toEqual([rerun.job.id, first.job.id]);
  });

  test("tracks list filters and quick-open state", async () => {
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => undefined,
        granolaClient: {
          listDocuments: async () => documents,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const list = await app.listMeetings({
      limit: 10,
      sort: "title-asc",
      updatedFrom: "2024-01-01",
      updatedTo: "2024-01-31",
    });
    const meeting = await app.findMeeting("Alpha Sync");

    expect(list.meetings).toHaveLength(1);
    expect(list.source).toBe("live");
    expect(meeting.meeting.meeting.id).toBe("doc-alpha-1111");
    expect(app.getState().ui).toEqual(
      expect.objectContaining({
        meetingSort: "title-asc",
        meetingUpdatedFrom: "2024-01-01",
        meetingUpdatedTo: "2024-01-31",
        selectedMeetingId: "doc-alpha-1111",
        surface: "web",
        view: "meeting-detail",
      }),
    );
  });

  test("updates auth state through the shared app controller", async () => {
    let authState: GranolaAppAuthState = {
      mode: "stored-session",
      refreshAvailable: true,
      storedSessionAvailable: true,
      supabaseAvailable: true,
      supabasePath: "/tmp/supabase.json",
    };

    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile: "",
          output: "/tmp/transcripts",
        },
      },
      {
        auth: authState,
        authController: {
          inspect: async () => authState,
          login: async () => authState,
          logout: async () => {
            authState = {
              ...authState,
              mode: "supabase-file",
              refreshAvailable: false,
              storedSessionAvailable: false,
            };
            return authState;
          },
          refresh: async () => {
            authState = {
              ...authState,
              lastError: "refresh failed",
            };
            throw new Error("refresh failed");
          },
          switchMode: async (mode) => {
            authState = {
              ...authState,
              lastError: undefined,
              mode,
            };
            return authState;
          },
        },
        cacheLoader: async () => undefined,
        createGranolaClient: async (mode) => ({
          auth: {
            ...authState,
            mode: mode ?? authState.mode,
          },
          client: {
            listDocuments: async () => documents,
          },
        }),
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    await app.listDocuments();
    const switched = await app.switchAuthMode("supabase-file");
    expect(switched.mode).toBe("supabase-file");
    expect(app.getState().documents.loaded).toBe(false);
    expect(app.getState().ui.view).toBe("auth");

    await expect(app.refreshAuth()).rejects.toThrow("refresh failed");
    expect(app.getState().auth.lastError).toBe("refresh failed");

    const loggedOut = await app.logoutAuth();
    expect(loggedOut.storedSessionAvailable).toBe(false);
    expect(app.getState().auth.mode).toBe("supabase-file");
  });

  test("derives folders and transcript detail from API-key style documents", async () => {
    const app = new GranolaApp(
      {
        apiKey: "grn_test_123",
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        transcripts: {
          cacheFile: "",
          output: "/tmp/transcripts",
        },
      },
      {
        auth: {
          apiKeyAvailable: true,
          mode: "api-key",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: false,
        },
        cacheLoader: async () => undefined,
        granolaClient: {
          listDocuments: async () => [
            {
              content: "## API Key Meeting",
              createdAt: "2024-01-01T00:00:00Z",
              folderMemberships: [
                {
                  id: "fol_12345678901234",
                  name: "Product",
                },
              ],
              id: "not_1d3tmYTlCICgjy",
              notesPlain: "API Key Meeting",
              tags: [],
              title: "API Key Meeting",
              transcriptSegments: [
                {
                  documentId: "not_1d3tmYTlCICgjy",
                  endTimestamp: "2024-01-01T00:01:00Z",
                  id: "segment-1",
                  isFinal: true,
                  source: "microphone",
                  startTimestamp: "2024-01-01T00:00:00Z",
                  text: "Hello from the API key path",
                },
              ],
              updatedAt: "2024-01-02T00:00:00Z",
            },
          ],
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const folders = await app.listFolders({ limit: 10 });
    const meeting = await app.getMeeting("not_1d3tmYTlCICgjy");

    expect(folders.folders).toEqual([
      expect.objectContaining({
        documentCount: 1,
        id: "fol_12345678901234",
        name: "Product",
      }),
    ]);
    expect(meeting.meeting.meeting.folders).toEqual([
      expect.objectContaining({
        id: "fol_12345678901234",
        name: "Product",
      }),
    ]);
    expect(meeting.meeting.transcriptText).toContain("Hello from the API key path");
    expect(meeting.meeting.meeting.transcriptLoaded).toBe(true);
  });

  test("uses the local meeting index as a fast path for web surfaces", async () => {
    const listDocuments = vi.fn(async () => documents);
    const meetingIndexStore = new MemoryMeetingIndexStore();
    await meetingIndexStore.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
        folders: [],
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team", "alpha"],
        title: "Alpha Sync",
        transcriptLoaded: false,
        transcriptSegmentCount: 0,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
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
        cacheLoader: async () => undefined,
        granolaClient: {
          listDocuments,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const indexed = await app.listMeetings({ limit: 10 });
    expect(indexed.source).toBe("index");
    expect(indexed.meetings[0]?.id).toBe("doc-alpha-1111");
    expect(listDocuments).not.toHaveBeenCalled();

    const refreshed = await app.listMeetings({ forceRefresh: true, limit: 10 });
    expect(refreshed.source).toBe("live");
    expect(listDocuments.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(app.getState().ui.meetingListSource).toBe("live");
    expect(app.getState().index).toEqual(
      expect.objectContaining({
        available: true,
        loaded: true,
        meetingCount: 1,
      }),
    );
  });
});
