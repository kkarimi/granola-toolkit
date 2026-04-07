import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import { MemoryAgentHarnessStore } from "../src/agent-harnesses.ts";
import { MemoryAutomationArtefactStore } from "../src/automation-artefacts.ts";
import { MemoryAutomationMatchStore } from "../src/automation-matches.ts";
import { MemoryAutomationRunStore } from "../src/automation-runs.ts";
import { MemoryAutomationRuleStore } from "../src/automation-rules.ts";
import { MemoryExportJobStore } from "../src/export-jobs.ts";
import { MemoryMeetingIndexStore } from "../src/meeting-index.ts";
import { MemoryPkmTargetStore } from "../src/pkm-targets.ts";
import { MemoryPluginSettingsStore } from "../src/plugins.ts";
import { MemorySearchIndexStore } from "../src/search-index.ts";
import { MemorySyncEventStore } from "../src/sync-events.ts";
import { MemorySyncStateStore } from "../src/sync-state.ts";
import type { GranolaAppAuthState } from "../src/app/index.ts";
import type { GranolaAutomationAgentRequest, GranolaAutomationAgentResult } from "../src/agents.ts";
import type { AppConfig, CacheData, GranolaDocument, GranolaFolder } from "../src/types.ts";

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

function enableAutomation(config: AppConfig): AppConfig {
  return {
    ...config,
    plugins: {
      enabled: {
        ...config.plugins?.enabled,
        automation: true,
        "markdown-viewer": config.plugins?.enabled?.["markdown-viewer"] ?? true,
      },
      settingsFile: config.plugins?.settingsFile ?? "/tmp/plugins.json",
      sources: {
        ...config.plugins?.sources,
        automation: "config",
        "markdown-viewer": config.plugins?.sources?.["markdown-viewer"] ?? "default",
      },
    },
  };
}

describe("GranolaApp", () => {
  test("keeps automation optional until the plugin is enabled", async () => {
    const pluginSettingsStore = new MemoryPluginSettingsStore();
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
        granolaClient: { listDocuments: async () => documents },
        pluginSettingsStore,
      },
    );

    await expect(app.listPlugins()).resolves.toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          capabilities: ["automation"],
          enabled: false,
          id: "automation",
          settingsContributions: [
            {
              capability: "automation",
              id: "automation-harness-editor",
              section: "plugins",
            },
            {
              capability: "automation",
              id: "automation-review-diagnostics",
              section: "diagnostics",
            },
          ],
        }),
        expect.objectContaining({
          capabilities: ["markdown-rendering"],
          enabled: true,
          id: "markdown-viewer",
        }),
      ]),
    });
    await expect(app.listAutomationRules()).rejects.toThrow(/automation plugin is disabled/i);

    await expect(app.setPluginEnabled("automation", true)).resolves.toEqual(
      expect.objectContaining({
        enabled: true,
        id: "automation",
      }),
    );
    await expect(pluginSettingsStore.readSettings()).resolves.toEqual({
      enabled: {
        automation: true,
        "markdown-viewer": true,
      },
    });

    await expect(app.setPluginEnabled("markdown-viewer", false)).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        id: "markdown-viewer",
      }),
    );
    await expect(pluginSettingsStore.readSettings()).resolves.toEqual({
      enabled: {
        automation: true,
        "markdown-viewer": false,
      },
    });
  });

  test("does not auto-enable automation just because empty stores are wired", async () => {
    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        plugins: {
          enabled: {},
          settingsFile: "/tmp/plugins.json",
          sources: {
            automation: "default",
            "markdown-viewer": "default",
          },
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile: "",
          output: "/tmp/transcripts",
        },
      },
      {
        agentHarnessStore: new MemoryAgentHarnessStore(),
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        agentRunner: {
          run: async (): Promise<GranolaAutomationAgentResult> => ({
            dryRun: false,
            model: "gpt-5-codex",
            output: "noop",
            prompt: "",
            provider: "codex",
          }),
        },
        automationArtefactStore: new MemoryAutomationArtefactStore(),
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRuleStore: new MemoryAutomationRuleStore(),
        automationRunStore: new MemoryAutomationRunStore(),
        cacheLoader: async () => cacheData,
        granolaClient: { listDocuments: async () => documents },
      },
    );

    await expect(app.listPlugins()).resolves.toEqual({
      plugins: expect.arrayContaining([
        expect.objectContaining({
          enabled: false,
          id: "automation",
        }),
      ]),
    });
  });

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
        surface: "cli",
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
    expect(app.getState().ui.surface).toBe("server");
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
    expect(meeting.source.document.id).toBe("doc-alpha-1111");
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
      enableAutomation({
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
      }),
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
      enableAutomation({
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
      }),
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
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('"roleHelpers"'),
      }),
    );
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("You: Hello team"),
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
    expect(state.ui.surface).toBe("cli");
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
      enableAutomation({
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
      }),
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

  test("evaluates fixture cases through harnesses and parses structured outputs", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-eval-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const evaluationDocuments: GranolaDocument[] = [
      {
        content: "Fallback note body",
        createdAt: "2024-01-01T09:00:00Z",
        id: "doc-eval-1111",
        notesPlain: "Existing notes",
        people: {
          attendees: [{ email: "alice@example.com", name: "Alice Chen" }],
          creator: { email: "nima@example.com", name: "Nima Karimi" },
        },
        tags: ["team"],
        title: "Evaluation Sync",
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ];
    const evaluationCache: CacheData = {
      documents: {
        "doc-eval-1111": {
          createdAt: "2024-01-01T09:00:00Z",
          id: "doc-eval-1111",
          title: "Evaluation Sync",
          updatedAt: "2024-01-03T10:00:00Z",
        },
      },
      transcripts: {
        "doc-eval-1111": [
          {
            documentId: "doc-eval-1111",
            endTimestamp: "2024-01-01T09:00:03Z",
            id: "segment-1",
            isFinal: true,
            source: "microphone",
            startTimestamp: "2024-01-01T09:00:01Z",
            text: "I will send the recap.",
          },
        ],
      },
    };
    const app = new GranolaApp(
      enableAutomation({
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
      }),
      {
        agentHarnessStore: new MemoryAgentHarnessStore([
          {
            id: "team-harness",
            name: "Team harness",
            prompt: "Write concise decision-focused notes.",
            provider: "openrouter",
          },
        ]),
        agentRunner: {
          run: vi.fn(
            async (
              request: GranolaAutomationAgentRequest,
            ): Promise<GranolaAutomationAgentResult> => ({
              dryRun: false,
              model: "openai/gpt-5-mini",
              output: JSON.stringify({
                actionItems: [{ owner: "you", title: "Send recap" }],
                decisions: [],
                followUps: [],
                highlights: [],
                markdown: "# Evaluation Sync Notes",
                participantSummaries: [
                  {
                    actionItems: ["Send recap"],
                    role: "self",
                    speaker: "You",
                    summary: "Owned the recap.",
                  },
                ],
                sections: [{ body: "Done.", title: "Summary" }],
                summary: "Owned the recap.",
                title: "Evaluation Sync Notes",
              }),
              prompt: request.prompt,
              provider: request.provider ?? "openrouter",
            }),
          ),
        },
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        cacheLoader: async () => evaluationCache,
        granolaClient: {
          listDocuments: async () => evaluationDocuments,
          listFolders: async () => [],
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const bundle = await app.getMeeting("doc-eval-1111");
    const result = await app.evaluateAutomationCases([
      {
        bundle,
        id: "case-1",
        title: "Evaluation Sync",
      },
    ]);

    expect(result.results).toEqual([
      expect.objectContaining({
        caseId: "case-1",
        harnessId: "team-harness",
        parseMode: "json",
        status: "completed",
        structured: expect.objectContaining({
          actionItems: [
            expect.objectContaining({
              owner: "Nima Karimi",
              ownerEmail: "nima@example.com",
              ownerOriginal: "you",
            }),
          ],
          participantSummaries: [
            expect.objectContaining({
              speaker: "You",
              summary: "Owned the recap.",
            }),
          ],
        }),
      }),
    ]);
  });

  test("stores pipeline artefacts, uses fallback harnesses, and supports reruns", async () => {
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const meetingIndexStore = new MemoryMeetingIndexStore();
    const artefactStore = new MemoryAutomationArtefactStore();
    const runStore = new MemoryAutomationRunStore();
    const searchIndexStore = new MemorySearchIndexStore();
    const runAgent = vi.fn(
      async (request: GranolaAutomationAgentRequest): Promise<GranolaAutomationAgentResult> => {
        if (request.provider === "openrouter") {
          throw new Error("rate limited");
        }

        return {
          dryRun: false,
          model: request.model ?? "gpt-5-codex",
          output: JSON.stringify({
            actionItems: [{ owner: "Nima", title: "Send the recap" }],
            decisions: ["Ship the new pipeline"],
            followUps: ["Confirm launch date"],
            highlights: ["Fallback harness succeeded"],
            markdown:
              "# Alpha Sync Notes\n\n## Summary\n\nFallback provider completed the notes pipeline.",
            metadata: { source: "fallback" },
            sections: [
              {
                body: "Fallback provider completed the notes pipeline.",
                title: "Summary",
              },
            ],
            summary: "Fallback provider completed the notes pipeline.",
            title: "Alpha Sync Notes",
          }),
          prompt: request.prompt,
          provider: request.provider ?? "codex",
        };
      },
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
      enableAutomation({
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
        automation: {
          artefactsFile: "/tmp/automation-artefacts.json",
          rulesFile: "/tmp/automation-rules.json",
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
      }),
      {
        agentHarnessStore: new MemoryAgentHarnessStore([
          {
            id: "primary-notes",
            name: "Primary notes",
            prompt: "Write crisp notes for recurring team meetings.",
            provider: "openrouter",
          },
          {
            id: "fallback-notes",
            name: "Fallback notes",
            prompt: "Retry and keep the output compact and decision-focused.",
            provider: "codex",
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
        automationArtefactStore: artefactStore,
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                fallbackHarnessIds: ["fallback-notes"],
                harnessId: "primary-notes",
                id: "pipeline-notes",
                kind: "agent",
                pipeline: {
                  kind: "notes",
                },
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
        searchIndexStore,
      },
      { surface: "server" },
    );

    await app.sync();
    const searchResults = await app.listMeetings({
      limit: 10,
      preferIndex: true,
      search: "fallback provider",
    });

    const firstArtefacts = await app.listAutomationArtefacts({ kind: "notes", limit: 10 });
    expect(firstArtefacts.artefacts).toHaveLength(1);
    expect(searchResults.source).toBe("index");
    expect(searchResults.meetings[0]?.id).toBe("doc-alpha-1111");
    expect(
      (await searchIndexStore.readIndex()).find((entry) => entry.id === "doc-alpha-1111"),
    ).toEqual(
      expect.objectContaining({
        artefactCount: 1,
        artefactTitles: ["Alpha Sync Notes"],
      }),
    );
    expect(firstArtefacts.artefacts[0]).toEqual(
      expect.objectContaining({
        attempts: [
          expect.objectContaining({
            error: "rate limited",
            harnessId: "primary-notes",
            provider: "openrouter",
          }),
          expect.objectContaining({
            harnessId: "fallback-notes",
            provider: "codex",
          }),
        ],
        history: [
          expect.objectContaining({
            action: "generated",
          }),
        ],
        kind: "notes",
        provider: "codex",
        status: "generated",
        structured: expect.objectContaining({
          summary: "Fallback provider completed the notes pipeline.",
          title: "Alpha Sync Notes",
        }),
      }),
    );

    const updated = await app.updateAutomationArtefact(firstArtefacts.artefacts[0]!.id, {
      markdown: "# Alpha Sync\n\nEdited notes",
      note: "Tightened the generated copy",
      summary: "Edited note summary",
      title: "Alpha Sync Notes (Edited)",
    });
    expect(updated).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({
            action: "edited",
            note: "Tightened the generated copy",
          }),
        ]),
        structured: expect.objectContaining({
          markdown: "# Alpha Sync\n\nEdited notes",
          summary: "Edited note summary",
          title: "Alpha Sync Notes (Edited)",
        }),
      }),
    );

    const approved = await app.resolveAutomationArtefact(
      firstArtefacts.artefacts[0]!.id,
      "approve",
      {
        note: "Ready to share",
      },
    );
    expect(approved).toEqual(
      expect.objectContaining({
        history: expect.arrayContaining([
          expect.objectContaining({
            action: "approved",
            note: "Ready to share",
          }),
        ]),
        status: "approved",
      }),
    );
    expect(app.getState().automation.pendingArtefactCount).toBe(0);

    const firstRuns = await app.listAutomationRuns({ limit: 10 });
    expect(firstRuns.runs[0]).toEqual(
      expect.objectContaining({
        actionId: "pipeline-notes",
        artefactIds: [firstArtefacts.artefacts[0]!.id],
        result: "Fallback provider completed the notes pipeline.",
      }),
    );

    const rerun = await app.rerunAutomationArtefact(firstArtefacts.artefacts[0]!.id);
    expect(rerun).toEqual(
      expect.objectContaining({
        kind: "notes",
        rerunOfId: firstArtefacts.artefacts[0]!.id,
        status: "generated",
      }),
    );

    const afterRerun = await app.listAutomationArtefacts({ kind: "notes", limit: 10 });
    expect(afterRerun.artefacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              action: "approved",
            }),
            expect.objectContaining({
              action: "rerun",
            }),
          ]),
          id: firstArtefacts.artefacts[0]!.id,
          status: "superseded",
          supersededById: rerun.id,
        }),
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              action: "generated",
            }),
          ]),
          id: rerun.id,
          rerunOfId: firstArtefacts.artefacts[0]!.id,
        }),
      ]),
    );
    expect(app.getState().automation.artefactCount).toBe(2);
    expect(app.getState().automation.pendingArtefactCount).toBe(1);
    expect(runAgent).toHaveBeenCalledTimes(4);
  });

  test("runs downstream approval actions after approving an artefact", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-approval-actions-"));
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(`ok:${url}`, {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const previousSlackUrl = process.env.TEST_SLACK_URL;
    process.env.TEST_SLACK_URL = "https://hooks.slack.test/approved";

    const app = new GranolaApp(
      enableAutomation({
        agents: {
          codexCommand: "codex",
          defaultProvider: "codex",
          dryRun: false,
          harnessesFile: "/tmp/agent-harnesses.json",
          maxRetries: 1,
          openaiBaseUrl: "https://api.openai.com/v1",
          openrouterBaseUrl: "https://openrouter.ai/api/v1",
          timeoutMs: 30_000,
        },
        automation: {
          artefactsFile: "/tmp/automation-artefacts.json",
          rulesFile: "/tmp/automation-rules.json",
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
      }),
      {
        agentRunner: {
          run: async (
            request: GranolaAutomationAgentRequest,
          ): Promise<GranolaAutomationAgentResult> => ({
            dryRun: false,
            model: "gpt-5-codex",
            output: JSON.stringify({
              markdown: "# Approved Notes\n\nShip it.",
              summary: "Ship it",
              title: "Approved Notes",
            }),
            prompt: request.prompt,
            provider: "codex",
          }),
        },
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        automationArtefactStore: new MemoryAutomationArtefactStore(),
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                id: "pipeline-notes",
                kind: "agent",
                pipeline: {
                  kind: "notes",
                },
                prompt: "Write approved notes",
              },
              {
                args: [
                  "-e",
                  "let data='';process.stdin.on('data',chunk=>data+=chunk);process.stdin.on('end',()=>{const input=JSON.parse(data);process.stdout.write(input.artefact.title);});",
                ],
                command: "node",
                id: "publish-command",
                kind: "command",
                sourceActionId: "pipeline-notes",
                trigger: "approval",
              },
              {
                format: "markdown",
                id: "write-approved-markdown",
                kind: "write-file",
                outputDir,
                sourceActionId: "pipeline-notes",
                trigger: "approval",
              },
              {
                id: "notify-webhook",
                kind: "webhook",
                sourceActionId: "pipeline-notes",
                trigger: "approval",
                url: "https://hooks.example.test/artefacts",
              },
              {
                id: "notify-slack",
                kind: "slack-message",
                sourceActionId: "pipeline-notes",
                text: "Approved {{artefact.title}}",
                trigger: "approval",
                webhookUrlEnv: "TEST_SLACK_URL",
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
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    try {
      await app.sync();

      const artefact = (await app.listAutomationArtefacts({ kind: "notes", limit: 10 }))
        .artefacts[0];
      expect(artefact).toBeDefined();

      const approved = await app.resolveAutomationArtefact(artefact!.id, "approve", {
        note: "Ready to publish",
      });

      expect(approved.status).toBe("approved");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "https://hooks.example.test/artefacts",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "https://hooks.slack.test/approved",
        expect.objectContaining({
          body: JSON.stringify({ text: "Approved Approved Notes" }),
          method: "POST",
        }),
      );

      const writtenFile = join(outputDir, "Alpha Sync-notes.md");
      expect(await readFile(writtenFile, "utf8")).toContain("# Approved Notes");

      const runs = await app.listAutomationRuns({ limit: 10 });
      expect(runs.runs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            actionId: "publish-command",
            artefactIds: [artefact!.id],
            result: "Approved Notes",
            status: "completed",
          }),
          expect.objectContaining({
            actionId: "write-approved-markdown",
            artefactIds: [artefact!.id],
            result: `Wrote markdown file to ${writtenFile}`,
            status: "completed",
          }),
          expect.objectContaining({
            actionId: "notify-webhook",
            artefactIds: [artefact!.id],
            result: "ok:https://hooks.example.test/artefacts",
            status: "completed",
          }),
          expect.objectContaining({
            actionId: "notify-slack",
            artefactIds: [artefact!.id],
            result: "ok:https://hooks.slack.test/approved",
            status: "completed",
          }),
        ]),
      );
    } finally {
      if (previousSlackUrl == null) {
        delete process.env.TEST_SLACK_URL;
      } else {
        process.env.TEST_SLACK_URL = previousSlackUrl;
      }
      vi.unstubAllGlobals();
    }
  });

  test("auto-approval dispatches downstream actions during sync", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-auto-approval-actions-"));
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");

    const app = new GranolaApp(
      enableAutomation({
        agents: {
          codexCommand: "codex",
          defaultProvider: "codex",
          dryRun: false,
          harnessesFile: "/tmp/agent-harnesses.json",
          maxRetries: 1,
          openaiBaseUrl: "https://api.openai.com/v1",
          openrouterBaseUrl: "https://openrouter.ai/api/v1",
          timeoutMs: 30_000,
        },
        automation: {
          artefactsFile: "/tmp/automation-artefacts.json",
          rulesFile: "/tmp/automation-rules.json",
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
      }),
      {
        agentRunner: {
          run: async (
            request: GranolaAutomationAgentRequest,
          ): Promise<GranolaAutomationAgentResult> => ({
            dryRun: false,
            model: "gpt-5-codex",
            output: JSON.stringify({
              markdown: "# Auto Notes\n\nApproved automatically.",
              summary: "Auto-approved",
              title: "Auto Notes",
            }),
            prompt: request.prompt,
            provider: "codex",
          }),
        },
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        automationArtefactStore: new MemoryAutomationArtefactStore(),
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                approvalMode: "auto",
                id: "pipeline-notes",
                kind: "agent",
                pipeline: {
                  kind: "notes",
                },
                prompt: "Write auto-approved notes",
              },
              {
                format: "json",
                id: "write-approved-json",
                kind: "write-file",
                outputDir,
                sourceActionId: "pipeline-notes",
                trigger: "approval",
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
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    await app.sync();

    const artefact = (await app.listAutomationArtefacts({ kind: "notes", limit: 10 })).artefacts[0];
    expect(artefact).toEqual(
      expect.objectContaining({
        status: "approved",
      }),
    );

    const writtenFile = join(outputDir, "Alpha Sync-notes.json");
    const writtenPayload = JSON.parse(await readFile(writtenFile, "utf8")) as {
      approval?: { note?: string };
      artefact?: { title?: string };
    };
    expect(writtenPayload.approval?.note).toBe("Auto-approved by automation rule");
    expect(writtenPayload.artefact?.title).toBe("Auto Notes");

    const runs = await app.listAutomationRuns({ limit: 10 });
    expect(runs.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "write-approved-json",
          artefactIds: [artefact!.id],
          status: "completed",
        }),
      ]),
    );
  });

  test("syncs approved artefacts into named PKM targets", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-pkm-target-"));
    const cacheFile = join(await mkdtemp(join(tmpdir(), "granola-app-cache-")), "cache.json");
    await writeFile(cacheFile, "{}\n", "utf8");

    const app = new GranolaApp(
      enableAutomation({
        agents: {
          codexCommand: "codex",
          defaultProvider: "codex",
          dryRun: false,
          harnessesFile: "/tmp/agent-harnesses.json",
          maxRetries: 1,
          openaiBaseUrl: "https://api.openai.com/v1",
          openrouterBaseUrl: "https://openrouter.ai/api/v1",
          timeoutMs: 30_000,
        },
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
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile,
          output: "/tmp/transcripts",
        },
      }),
      {
        agentRunner: {
          run: async (
            request: GranolaAutomationAgentRequest,
          ): Promise<GranolaAutomationAgentResult> => ({
            dryRun: false,
            model: "gpt-5-codex",
            output: JSON.stringify({
              markdown: "# PKM Notes\n\nCaptured for the team vault.",
              summary: "Captured for the team vault",
              title: "PKM Notes",
            }),
            prompt: request.prompt,
            provider: "codex",
          }),
        },
        auth: {
          mode: "supabase-file",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        automationArtefactStore: new MemoryAutomationArtefactStore(),
        automationMatchStore: new MemoryAutomationMatchStore(),
        automationRuleStore: new MemoryAutomationRuleStore([
          {
            actions: [
              {
                approvalMode: "auto",
                id: "pipeline-notes",
                kind: "agent",
                pipeline: {
                  kind: "notes",
                },
                prompt: "Write vault-ready notes",
              },
              {
                id: "vault-sync",
                kind: "pkm-sync",
                sourceActionId: "pipeline-notes",
                targetId: "obsidian-team",
                trigger: "approval",
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
        now: () => new Date("2024-03-01T12:00:00Z"),
        pkmTargetStore: new MemoryPkmTargetStore([
          {
            folderSubdirectories: true,
            id: "obsidian-team",
            kind: "obsidian",
            outputDir,
          },
        ]),
      },
      { surface: "server" },
    );

    await app.sync();

    const writtenFile = join(outputDir, "Team", "Alpha Sync-notes.md");
    const content = await readFile(writtenFile, "utf8");
    expect(content).toContain('title: "PKM Notes"');
    expect(content).toContain('meetingId: "doc-alpha-1111"');
    expect(content).toContain("# PKM Notes");

    const artefact = (await app.listAutomationArtefacts({ kind: "notes", limit: 10 })).artefacts[0];
    const runs = await app.listAutomationRuns({ limit: 10 });
    expect(runs.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "vault-sync",
          artefactIds: [artefact!.id],
          result: `Synced PKM target obsidian-team to ${writtenFile}`,
          status: "completed",
        }),
      ]),
    );
  });

  test("detects failed processing issues and recovers them", async () => {
    const runAgent = vi.fn(
      async (): Promise<GranolaAutomationAgentResult> => ({
        command: "codex exec --json",
        dryRun: false,
        model: "gpt-5-codex",
        output: JSON.stringify({
          markdown: "# Alpha Sync\n\nRecovered notes",
          summary: "Recovered notes",
          title: "Alpha Sync Notes",
        }),
        prompt: "Recover the failed notes pipeline",
        provider: "codex",
      }),
    );
    const app = new GranolaApp(
      enableAutomation({
        agents: {
          codexCommand: "codex",
          defaultProvider: "codex",
          dryRun: false,
          harnessesFile: "/tmp/agent-harnesses.json",
          maxRetries: 1,
          openaiBaseUrl: "https://api.openai.com/v1",
          openrouterBaseUrl: "https://openrouter.ai/api/v1",
          timeoutMs: 30_000,
        },
        automation: {
          artefactsFile: "/tmp/automation-artefacts.json",
          rulesFile: "/tmp/automation-rules.json",
        },
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        supabase: "/tmp/supabase.json",
        transcripts: {
          cacheFile: "/tmp/cache.json",
          output: "/tmp/transcripts",
        },
      }),
      {
        agentRunner: {
          run: runAgent,
        },
        auth: {
          mode: "stored-session",
          refreshAvailable: true,
          storedSessionAvailable: true,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        automationRules: [
          {
            actions: [
              {
                id: "pipeline-notes",
                kind: "agent",
                pipeline: {
                  kind: "notes",
                },
                prompt: "Turn the transcript into concise notes.",
              },
            ],
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              transcriptLoaded: true,
            },
          },
        ],
        automationRuns: [
          {
            actionId: "pipeline-notes",
            actionKind: "agent",
            actionName: "pipeline-notes",
            error: "provider timeout",
            eventId: "sync-1:transcript.ready",
            eventKind: "transcript.ready",
            folders: [],
            id: "sync-1:team-transcript:pipeline-notes",
            matchId: "sync-1:team-transcript",
            matchedAt: "2024-03-01T12:30:00.000Z",
            meetingId: "doc-alpha-1111",
            ruleId: "team-transcript",
            ruleName: "Team transcript ready",
            startedAt: "2024-03-01T12:30:00.000Z",
            status: "failed",
            tags: ["team", "alpha"],
            title: "Alpha Sync",
            transcriptLoaded: true,
          },
        ],
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        meetingIndex: [
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
            tags: ["team", "alpha"],
            title: "Alpha Sync",
            transcriptLoaded: true,
            transcriptSegmentCount: 1,
            updatedAt: "2024-03-01T12:35:00.000Z",
          },
        ],
        now: () => new Date("2024-03-01T13:00:00.000Z"),
        syncState: {
          eventCount: 0,
          lastChanges: [],
          lastCompletedAt: "2024-03-01T12:45:00.000Z",
          running: false,
        },
      },
      { surface: "server" },
    );

    const issues = await app.listProcessingIssues();
    const failedIssue = issues.issues.find((issue) => issue.kind === "pipeline-failed");
    expect(failedIssue).toEqual(
      expect.objectContaining({
        actionId: "pipeline-notes",
        meetingId: "doc-alpha-1111",
      }),
    );

    const recovery = await app.recoverProcessingIssue(failedIssue!.id);
    expect(recovery).toEqual(
      expect.objectContaining({
        runCount: 1,
        syncRan: false,
      }),
    );
    expect(runAgent).toHaveBeenCalledTimes(1);

    const artefacts = await app.listAutomationArtefacts({ kind: "notes", limit: 10 });
    expect(artefacts.artefacts).toEqual([
      expect.objectContaining({
        kind: "notes",
        status: "generated",
        structured: expect.objectContaining({
          summary: "Recovered notes",
          title: "Alpha Sync Notes",
        }),
      }),
    ]);
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
        surface: "web",
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
    expect(app.getState().ui.surface).toBe("cli");

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

  test("hydrates transcript detail from the Granola API when the local cache has no segments", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "granola-cache-"));
    const cacheFile = join(cacheDir, "cache-v6.json");
    await writeFile(cacheFile, JSON.stringify({ cache: JSON.stringify({ state: {} }) }), "utf8");
    const getDocumentTranscript = vi.fn(async () => [
      {
        documentId: "doc-alpha-1111",
        endTimestamp: "2024-01-03T10:00:05Z",
        id: "segment-api-1",
        isFinal: true,
        source: "microphone",
        startTimestamp: "2024-01-03T10:00:00Z",
        text: "Transcript loaded from the Granola API",
      },
    ]);

    const app = new GranolaApp(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        transcripts: {
          cacheFile,
          output: "/tmp/transcripts",
        },
      },
      {
        auth: {
          apiKeyAvailable: false,
          mode: "stored-session",
          refreshAvailable: true,
          storedSessionAvailable: true,
          supabaseAvailable: true,
        },
        cacheLoader: async () => ({
          documents: {
            "doc-alpha-1111": {
              createdAt: "2024-01-01T09:00:00Z",
              id: "doc-alpha-1111",
              title: "Alpha Sync",
              updatedAt: "2024-01-03T10:00:00Z",
            },
          },
          transcripts: {},
        }),
        granolaClient: {
          getDocumentTranscript,
          listDocuments: async () => [documents[0]!],
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const meeting = await app.getMeeting("doc-alpha-1111");
    const transcript = await app.getMeeting("doc-alpha-1111");

    expect(getDocumentTranscript).toHaveBeenCalledTimes(1);
    expect(meeting.meeting.meeting.transcriptLoaded).toBe(true);
    expect(meeting.meeting.meeting.transcriptSegmentCount).toBe(1);
    expect(meeting.meeting.transcriptText).toContain("Transcript loaded from the Granola API");
    expect(transcript.meeting.transcriptText).toContain("Transcript loaded from the Granola API");
  });

  test("falls back to document-derived folders when live folder listing fails", async () => {
    const listFolders = vi.fn(async () => {
      throw new Error("folder listing not available for the active Granola client");
    });
    const listDocuments = vi.fn(async () => [
      {
        ...documents[0]!,
        folderMemberships: [
          {
            id: "fol_12345678901234",
            name: "Product",
          },
        ],
      },
    ]);

    const app = new GranolaApp(
      {
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
          listDocuments,
          listFolders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const result = await app.listFolders({ limit: 10 });

    expect(result.folders).toEqual([
      expect.objectContaining({
        documentCount: 1,
        id: "fol_12345678901234",
        name: "Product",
      }),
    ]);
    expect(listFolders).toHaveBeenCalledTimes(1);
    expect(listDocuments).toHaveBeenCalledTimes(1);
    expect(app.getState().folders).toEqual(
      expect.objectContaining({
        count: 1,
        loaded: true,
      }),
    );
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
    expect(app.getState().ui.surface).toBe("web");
    expect(app.getState().index).toEqual(
      expect.objectContaining({
        available: true,
        loaded: true,
        meetingCount: 1,
      }),
    );
  });

  test("falls back to the live snapshot for folder-scoped meeting lists when the index lacks folder metadata", async () => {
    const listDocuments = vi.fn(async () => [
      {
        ...documents[0]!,
        folderMemberships: [
          {
            id: "folder-team-1111",
            name: "Team",
          },
        ],
      },
    ]);
    const listFolders = vi.fn(async () => folders);
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
          listFolders,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const result = await app.listMeetings({
      folderId: "folder-team-1111",
      limit: 10,
    });

    expect(result.source).toBe("live");
    expect(result.meetings).toEqual([
      expect.objectContaining({
        id: "doc-alpha-1111",
        folders: [expect.objectContaining({ id: "folder-team-1111", name: "Team" })],
      }),
    ]);
    expect(listDocuments).toHaveBeenCalledTimes(1);
    expect(listFolders).toHaveBeenCalledTimes(1);
  });

  test("uses the local catalog snapshot before hitting live Granola APIs", async () => {
    const listDocuments = vi.fn(async () => documents);
    const listFolders = vi.fn(async () => folders);
    const cacheLoader = vi.fn(async () => cacheData);
    const app = new GranolaApp(
      {
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
          mode: "api-key",
          apiKeyAvailable: true,
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: false,
        },
        cacheLoader,
        catalogSnapshot: {
          cacheData,
          documents,
          folders,
          updatedAt: "2024-03-01T12:00:00Z",
        },
        granolaClient: {
          listDocuments,
          listFolders,
        },
        now: () => new Date("2024-03-01T12:05:00Z"),
      },
      { surface: "tui" },
    );

    const list = await app.listMeetings({ limit: 10 });
    const folderList = await app.listFolders({ limit: 10 });
    const meeting = await app.getMeeting("doc-alpha-1111");

    expect(list.source).toBe("snapshot");
    expect(list.meetings[0]?.id).toBe("doc-alpha-1111");
    expect(folderList.folders).toEqual([
      expect.objectContaining({
        id: "folder-team-1111",
        name: "Team",
      }),
    ]);
    expect(meeting.meeting.transcriptText).toContain("Hello team");
    expect(listDocuments).not.toHaveBeenCalled();
    expect(listFolders).not.toHaveBeenCalled();
    expect(cacheLoader).not.toHaveBeenCalled();
    expect(app.getState().cache).toEqual(
      expect.objectContaining({
        configured: true,
        loaded: true,
        source: "snapshot",
        transcriptCount: 1,
      }),
    );
    expect(app.getState().documents).toEqual(
      expect.objectContaining({
        count: documents.length,
        loaded: true,
        source: "snapshot",
      }),
    );
    expect(app.getState().folders).toEqual(
      expect.objectContaining({
        count: folders.length,
        loaded: true,
        source: "index",
      }),
    );
  });

  test("derives folders from the local meeting index before a live refresh", async () => {
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
            workspaceId: "workspace-1",
          },
        ],
        id: "doc-alpha-1111",
        noteContentSource: "notes",
        tags: ["team", "alpha"],
        title: "Alpha Sync",
        transcriptLoaded: true,
        transcriptSegmentCount: 1,
        updatedAt: "2024-01-03T10:00:00Z",
      },
    ]);

    const listDocuments = vi.fn(async () => documents);
    const listFolders = vi.fn(async () => folders);
    const app = new GranolaApp(
      {
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
          mode: "api-key",
          apiKeyAvailable: true,
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: false,
        },
        cacheLoader: async () => undefined,
        granolaClient: {
          listDocuments,
          listFolders,
        },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "tui" },
    );

    const result = await app.listFolders({ limit: 10 });

    expect(result.folders).toEqual([
      expect.objectContaining({
        documentCount: 1,
        id: "folder-team-1111",
        name: "Team",
      }),
    ]);
    expect(listDocuments).not.toHaveBeenCalled();
    expect(listFolders).not.toHaveBeenCalled();
    expect(app.getState().folders).toEqual(
      expect.objectContaining({
        count: 1,
        loaded: true,
      }),
    );
  });
});
