import type { Component, OverlayHandle } from "@mariozechner/pi-tui";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type {
  FolderSummaryRecord,
  GranolaAppAuthState,
  GranolaAppState,
  GranolaAppStateEvent,
  GranolaMeetingBundle,
  MeetingSummaryRecord,
} from "../src/app/index.ts";
import type { CacheData, GranolaDocument } from "../src/types.ts";
import { GranolaTuiAutomationOverlay } from "../src/tui/automation.ts";
import { GranolaTuiQuickOpenPalette } from "../src/tui/palette.ts";
import {
  GranolaTuiWorkspace,
  type GranolaTuiApp,
  type GranolaTuiHost,
} from "../src/tui/workspace.ts";

const folders: FolderSummaryRecord[] = [
  {
    createdAt: "2024-01-01T08:00:00Z",
    documentCount: 1,
    id: "folder-team-1111",
    isFavourite: true,
    name: "Team",
    updatedAt: "2024-01-04T10:00:00Z",
  },
  {
    createdAt: "2024-01-02T08:00:00Z",
    documentCount: 1,
    id: "folder-sales-2222",
    isFavourite: false,
    name: "Sales",
    updatedAt: "2024-02-05T10:00:00Z",
  },
];

const meetings: MeetingSummaryRecord[] = [
  {
    createdAt: "2024-01-01T09:00:00Z",
    folders: [folders[0]!],
    id: "doc-alpha-1111",
    noteContentSource: "notes",
    tags: ["team", "alpha"],
    title: "Alpha Sync",
    transcriptLoaded: true,
    transcriptSegmentCount: 1,
    updatedAt: "2024-01-03T10:00:00Z",
  },
  {
    createdAt: "2024-02-01T09:00:00Z",
    folders: [folders[1]!],
    id: "doc-bravo-2222",
    noteContentSource: "content",
    tags: ["sales"],
    title: "Bravo Review",
    transcriptLoaded: true,
    transcriptSegmentCount: 1,
    updatedAt: "2024-02-05T12:00:00Z",
  },
];

const documents: Record<string, GranolaDocument> = {
  "doc-alpha-1111": {
    content: "Fallback alpha body",
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
  "doc-bravo-2222": {
    content: "Fallback bravo body",
    createdAt: "2024-02-01T09:00:00Z",
    id: "doc-bravo-2222",
    notes: {
      content: [
        {
          content: [{ text: "Bravo notes", type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    },
    notesPlain: "",
    tags: ["sales"],
    title: "Bravo Review",
    updatedAt: "2024-02-05T12:00:00Z",
  },
};

const cacheByMeeting: Record<string, CacheData> = {
  "doc-alpha-1111": {
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
          id: "segment-alpha",
          isFinal: true,
          source: "microphone",
          startTimestamp: "2024-01-01T09:00:01Z",
          text: "Hello team",
        },
      ],
    },
  },
  "doc-bravo-2222": {
    documents: {
      "doc-bravo-2222": {
        createdAt: "2024-02-01T09:00:00Z",
        id: "doc-bravo-2222",
        title: "Bravo Review",
        updatedAt: "2024-02-05T12:00:00Z",
      },
    },
    transcripts: {
      "doc-bravo-2222": [
        {
          documentId: "doc-bravo-2222",
          endTimestamp: "2024-02-01T09:00:03Z",
          id: "segment-bravo",
          isFinal: true,
          source: "system",
          startTimestamp: "2024-02-01T09:00:01Z",
          text: "Quarterly numbers look good",
        },
      ],
    },
  },
};

const authState: GranolaAppAuthState = {
  mode: "stored-session",
  refreshAvailable: true,
  storedSessionAvailable: true,
  supabaseAvailable: true,
  supabasePath: "/tmp/supabase.json",
};

class FakeOverlayHandle implements OverlayHandle {
  #focused = false;
  #hidden = false;

  constructor(private readonly onHide: () => void) {}

  hide(): void {
    this.onHide();
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
  }

  isHidden(): boolean {
    return this.#hidden;
  }

  focus(): void {
    this.#focused = true;
  }

  unfocus(): void {
    this.#focused = false;
  }

  isFocused(): boolean {
    return this.#focused;
  }
}

class FakeTuiHost implements GranolaTuiHost {
  readonly terminal = {
    columns: 100,
    rows: 24,
  };

  overlayComponent?: Component;
  focusedComponent?: Component;
  readonly requestRender = vi.fn();
  readonly setFocus = vi.fn((component: Component | null) => {
    if (!component) {
      this.focusedComponent = undefined;
      return;
    }

    this.focusedComponent = component;
    if ("focused" in component) {
      component.focused = true;
    }
  });
  readonly showOverlay = vi.fn((component: Component) => {
    this.overlayComponent = component;
    if ("focused" in component) {
      component.focused = true;
    }
    return new FakeOverlayHandle(() => {
      this.overlayComponent = undefined;
    });
  });
}

function createMeetingBundle(meeting: MeetingSummaryRecord): GranolaMeetingBundle {
  const document = documents[meeting.id];
  if (!document) {
    throw new Error(`missing fixture document for ${meeting.id}`);
  }

  const cacheData = cacheByMeeting[meeting.id];
  const transcriptText =
    meeting.id === "doc-alpha-1111"
      ? "[09:00:01] You: Hello team"
      : "[09:00:01] System: Quarterly numbers look good";

  return {
    cacheData,
    document,
    meeting: {
      meeting,
      note: {
        content: meeting.id === "doc-alpha-1111" ? "Alpha notes" : "Bravo notes",
        contentSource: meeting.noteContentSource,
        createdAt: document.createdAt,
        id: document.id,
        tags: document.tags,
        title: document.title,
        updatedAt: document.updatedAt,
      },
      noteMarkdown: `# ${document.title}\n\n${
        meeting.id === "doc-alpha-1111" ? "Alpha notes" : "Bravo notes"
      }`,
      roleHelpers: {
        ownerCandidates: [
          {
            id: meeting.id === "doc-alpha-1111" ? "self" : "speaker:system",
            label: meeting.id === "doc-alpha-1111" ? "You" : "System",
            role: meeting.id === "doc-alpha-1111" ? "self" : "system",
            source: "speaker",
          },
        ],
        participants: [],
        speakers: [
          {
            firstTimestamp:
              meeting.id === "doc-alpha-1111" ? "2024-01-01T09:00:01Z" : "2024-02-01T09:00:01Z",
            id: meeting.id === "doc-alpha-1111" ? "speaker:you" : "speaker:system",
            label: meeting.id === "doc-alpha-1111" ? "You" : "System",
            lastTimestamp:
              meeting.id === "doc-alpha-1111" ? "2024-01-01T09:00:03Z" : "2024-02-01T09:00:03Z",
            role: meeting.id === "doc-alpha-1111" ? "self" : "system",
            segmentCount: 1,
            source: meeting.id === "doc-alpha-1111" ? "microphone" : "system",
            wordCount: meeting.id === "doc-alpha-1111" ? 2 : 4,
          },
        ],
      },
      transcript: {
        createdAt: document.createdAt,
        id: document.id,
        segments:
          meeting.id === "doc-alpha-1111"
            ? [
                {
                  endTimestamp: "2024-01-01T09:00:03Z",
                  id: "segment-alpha",
                  isFinal: true,
                  source: "microphone",
                  speaker: "You",
                  startTimestamp: "2024-01-01T09:00:01Z",
                  text: "Hello team",
                },
              ]
            : [
                {
                  endTimestamp: "2024-02-01T09:00:03Z",
                  id: "segment-bravo",
                  isFinal: true,
                  source: "system",
                  speaker: "System",
                  startTimestamp: "2024-02-01T09:00:01Z",
                  text: "Quarterly numbers look good",
                },
              ],
        speakers: [
          {
            firstTimestamp:
              meeting.id === "doc-alpha-1111" ? "2024-01-01T09:00:01Z" : "2024-02-01T09:00:01Z",
            id: meeting.id === "doc-alpha-1111" ? "speaker:you" : "speaker:system",
            label: meeting.id === "doc-alpha-1111" ? "You" : "System",
            lastTimestamp:
              meeting.id === "doc-alpha-1111" ? "2024-01-01T09:00:03Z" : "2024-02-01T09:00:03Z",
            role: meeting.id === "doc-alpha-1111" ? "self" : "system",
            segmentCount: 1,
            source: meeting.id === "doc-alpha-1111" ? "microphone" : "system",
            wordCount: meeting.id === "doc-alpha-1111" ? 2 : 4,
          },
        ],
        title: document.title,
        updatedAt: document.updatedAt,
      },
      transcriptText,
    },
  };
}

function createAppState(): GranolaAppState {
  return {
    auth: authState,
    automation: {
      artefactCount: 0,
      loaded: true,
      pendingArtefactCount: 0,
      pendingRunCount: 0,
      matchCount: 0,
      matchesFile: "/tmp/automation-matches.jsonl",
      ruleCount: 0,
      rulesFile: "/tmp/automation-rules.json",
      runCount: 0,
      runsFile: "/tmp/automation-runs.jsonl",
    },
    cache: {
      configured: true,
      documentCount: 2,
      filePath: "/tmp/cache.json",
      loaded: true,
      loadedAt: "2024-03-01T12:00:00Z",
      transcriptCount: 2,
    },
    config: {
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
    },
    documents: {
      count: 2,
      loaded: true,
      loadedAt: "2024-03-01T12:00:00Z",
    },
    exports: {
      jobs: [],
    },
    folders: {
      count: 2,
      loaded: true,
      loadedAt: "2024-03-01T12:00:00Z",
    },
    index: {
      available: true,
      filePath: "/tmp/index.json",
      loaded: true,
      loadedAt: "2024-03-01T12:00:00Z",
      meetingCount: 2,
    },
    sync: {
      eventCount: 0,
      eventsFile: "/tmp/sync-events.jsonl",
      filePath: "/tmp/sync-state.json",
      lastChanges: [],
      lastCompletedAt: "2024-03-01T12:00:00Z",
      running: false,
      summary: {
        changedCount: 0,
        createdCount: 0,
        folderCount: 2,
        meetingCount: 2,
        removedCount: 0,
        transcriptReadyCount: 0,
      },
    },
    ui: {
      surface: "tui",
      view: "meeting-list",
    },
  };
}

function createWorkspaceHarness(
  options: {
    automationArtefacts?: Array<{
      id: string;
      meetingId?: string;
      status: "approved" | "generated" | "rejected" | "superseded";
      summary?: string;
      title: string;
    }>;
    automationRuns?: Array<{
      actionId: string;
      actionKind: "ask-user" | "command" | "export-notes" | "export-transcript";
      actionName: string;
      id: string;
      prompt?: string;
      result?: string;
      status: "completed" | "failed" | "pending" | "skipped";
      title: string;
    }>;
    failNextRefresh?: boolean;
    processingIssues?: Array<{
      id: string;
      kind:
        | "artefact-stale"
        | "pipeline-failed"
        | "pipeline-missing"
        | "sync-stale"
        | "transcript-missing";
      meetingId?: string;
      severity: "error" | "warning";
      title: string;
    }>;
  } = {},
) {
  const host = new FakeTuiHost();
  const state = createAppState();
  const listeners = new Set<(event: GranolaAppStateEvent) => void>();
  let failNextRefresh = options.failNextRefresh ?? false;

  const listFolders = vi.fn(async () => ({
    folders: [folders[1]!, folders[0]!],
  }));

  const listMeetings = vi.fn(
    async (
      input: {
        folderId?: string;
        forceRefresh?: boolean;
        limit?: number;
        preferIndex?: boolean;
      } = {},
    ) => {
      if (input.forceRefresh && failNextRefresh) {
        failNextRefresh = false;
        throw new Error("live refresh failed");
      }

      const scopedMeetings =
        input.folderId === "folder-team-1111"
          ? [meetings[0]!]
          : input.folderId === "folder-sales-2222"
            ? [meetings[1]!]
            : meetings;

      return {
        meetings: scopedMeetings,
        source: "live" as const,
      };
    },
  );

  const getMeeting = vi.fn(async (id: string) => {
    const meeting =
      meetings.find((candidate) => candidate.id === id) ??
      meetings.find((candidate) => candidate.id.startsWith(id));
    if (!meeting) {
      throw new Error(`meeting not found: ${id}`);
    }

    return createMeetingBundle(meeting);
  });

  const findMeeting = vi.fn(async (query: string) => {
    const lower = query.toLowerCase();
    const meeting =
      meetings.find(
        (candidate) => candidate.id === query || candidate.title.toLowerCase() === lower,
      ) ?? (query === "bravox" ? meetings[1] : undefined);

    if (!meeting) {
      throw new Error(`meeting not found: ${query}`);
    }

    return createMeetingBundle(meeting);
  });
  const resolveAutomationRun = vi.fn(async (id: string) => ({
    actionId: "review",
    actionKind: "ask-user" as const,
    actionName: "Review transcript",
    eventId: "sync-1:1",
    eventKind: "transcript.ready" as const,
    finishedAt: "2024-03-01T12:01:00.000Z",
    folders: [],
    id,
    matchId: "sync-1:team-transcript",
    matchedAt: "2024-03-01T12:00:00.000Z",
    meetingId: "doc-alpha-1111",
    result: "Approved from test",
    ruleId: "team-transcript",
    ruleName: "Team transcript ready",
    startedAt: "2024-03-01T12:00:00.000Z",
    status: "completed" as const,
    tags: ["team"],
    title: "Alpha Sync",
    transcriptLoaded: true,
  }));
  const listProcessingIssues = vi.fn(async () => ({
    issues: (options.processingIssues ?? []).map((issue) => ({
      detail: "Needs recovery",
      detectedAt: "2024-03-01T12:00:00.000Z",
      recoverable: true,
      ...issue,
    })),
  }));
  const resolveAutomationArtefact = vi.fn(async (id: string) => ({
    actionId: "pipeline-notes",
    actionName: "Pipeline notes",
    attempts: [],
    createdAt: "2024-03-01T12:00:00.000Z",
    eventId: "sync-1",
    history: [
      {
        action: "generated" as const,
        at: "2024-03-01T12:00:00.000Z",
      },
      {
        action: "approved" as const,
        at: "2024-03-01T12:01:00.000Z",
      },
    ],
    id,
    kind: "notes" as const,
    matchId: "sync-1:team-transcript",
    meetingId: "doc-alpha-1111",
    model: "gpt-5-codex",
    parseMode: "json" as const,
    prompt: "Prompt",
    provider: "codex" as const,
    rawOutput: "{}",
    ruleId: "team-transcript",
    ruleName: "Team transcript ready",
    runId: "sync-1:team-transcript:pipeline-notes",
    status: "approved" as const,
    structured: {
      actionItems: [],
      decisions: [],
      followUps: [],
      highlights: [],
      markdown: "# Alpha Sync",
      sections: [],
      summary: "Generated notes",
      title: "Alpha Sync Notes",
    },
    updatedAt: "2024-03-01T12:01:00.000Z",
  }));

  const recoverProcessingIssue = vi.fn(async (id: string) => ({
    issue: {
      detail: "Recovered in test",
      detectedAt: "2024-03-01T12:00:00.000Z",
      id,
      kind: "sync-stale" as const,
      recoverable: true,
      severity: "error" as const,
      title: "Sync needs attention",
    },
    recoveredAt: "2024-03-01T12:01:00.000Z",
    runCount: 0,
    syncRan: true,
  }));

  const app: GranolaTuiApp = {
    exportNotes: vi.fn(),
    exportTranscripts: vi.fn(),
    findFolder: vi.fn(),
    findMeeting,
    getFolder: vi.fn(),
    getMeeting,
    getState: () => state,
    inspectAuth: vi.fn(async () => state.auth),
    inspectSync: vi.fn(async () => state.sync),
    getAutomationArtefact: vi.fn(async (id: string) => ({
      actionId: "pipeline-notes",
      actionName: "Pipeline notes",
      attempts: [],
      createdAt: "2024-03-01T12:00:00.000Z",
      eventId: "sync-1",
      history: [
        {
          action: "generated" as const,
          at: "2024-03-01T12:00:00.000Z",
        },
      ],
      id,
      kind: "notes" as const,
      matchId: "sync-1:team-transcript",
      meetingId: "doc-alpha-1111",
      model: "gpt-5-codex",
      parseMode: "json" as const,
      prompt: "Prompt",
      provider: "codex" as const,
      rawOutput: "{}",
      ruleId: "team-transcript",
      ruleName: "Team transcript ready",
      runId: "sync-1:team-transcript:pipeline-notes",
      status: "generated" as const,
      structured: {
        actionItems: [],
        decisions: [],
        followUps: [],
        highlights: [],
        markdown: "# Alpha Sync",
        sections: [],
        summary: "Generated notes",
        title: "Alpha Sync Notes",
      },
      updatedAt: "2024-03-01T12:00:00.000Z",
    })),
    listAutomationArtefacts: vi.fn(async () => ({
      artefacts: (options.automationArtefacts ?? []).map((artefact) => ({
        actionId: "pipeline-notes",
        actionName: "Pipeline notes",
        attempts: [],
        createdAt: "2024-03-01T12:00:00.000Z",
        eventId: "sync-1",
        history: [
          {
            action: "generated" as const,
            at: "2024-03-01T12:00:00.000Z",
          },
        ],
        kind: "notes" as const,
        matchId: "sync-1:team-transcript",
        meetingId: artefact.meetingId ?? "doc-alpha-1111",
        model: "gpt-5-codex",
        parseMode: "json" as const,
        prompt: "Prompt",
        provider: "codex" as const,
        rawOutput: "{}",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        runId: `sync-1:team-transcript:${artefact.id}`,
        structured: {
          actionItems: [],
          decisions: [],
          followUps: [],
          highlights: [],
          markdown: "# Alpha Sync",
          sections: [],
          summary: artefact.summary ?? "Generated notes",
          title: artefact.title,
        },
        updatedAt: "2024-03-01T12:00:00.000Z",
        ...artefact,
      })),
    })),
    listProcessingIssues,
    listAutomationMatches: vi.fn(async () => ({ matches: [] })),
    listAutomationRuns: vi.fn(async () => ({
      runs: (options.automationRuns ?? []).map((run) => ({
        eventId: "sync-1:1",
        eventKind: "transcript.ready" as const,
        folders: [],
        matchedAt: "2024-03-01T12:00:00.000Z",
        meetingId: "doc-alpha-1111",
        matchId: "sync-1:team-transcript",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        startedAt: "2024-03-01T12:00:00.000Z",
        tags: ["team"],
        transcriptLoaded: true,
        ...run,
      })),
    })),
    listAutomationRules: vi.fn(async () => ({ rules: [] })),
    listExportJobs: vi.fn(async () => ({ jobs: [] })),
    listFolders,
    listMeetings,
    listSyncEvents: vi.fn(async () => ({ events: [] })),
    loginAuth: vi.fn(async () => state.auth),
    logoutAuth: vi.fn(async () => state.auth),
    recoverProcessingIssue,
    refreshAuth: vi.fn(async () => state.auth),
    resolveAutomationArtefact,
    resolveAutomationRun,
    rerunAutomationArtefact: vi.fn(),
    rerunExportJob: vi.fn(),
    sync: vi.fn(async () => ({
      changes: [],
      state: state.sync,
      summary: state.sync.summary ?? {
        changedCount: 0,
        createdCount: 0,
        folderCount: 0,
        meetingCount: 0,
        removedCount: 0,
        transcriptReadyCount: 0,
      },
    })),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    switchAuthMode: vi.fn(async () => state.auth),
    updateAutomationArtefact: vi.fn(),
  };

  const workspace = new GranolaTuiWorkspace(host, app, {
    initialMeetingId: "doc-alpha-1111",
    onExit: vi.fn(),
  });

  const flush = async () => {
    for (let index = 0; index < 4; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  const waitFor = async (predicate: () => boolean) => {
    for (let index = 0; index < 40; index += 1) {
      if (predicate()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error("timed out waiting for the TUI workspace to settle");
  };

  return {
    app,
    emitState(nextState: GranolaAppState) {
      for (const listener of listeners) {
        listener({
          state: nextState,
          timestamp: "2024-03-01T12:00:00Z",
          type: "state.updated",
        });
      }
    },
    flush,
    findMeeting,
    getMeeting,
    host,
    listFolders,
    listMeetings,
    listProcessingIssues,
    recoverProcessingIssue,
    resolveAutomationRun,
    resolveAutomationArtefact,
    state,
    waitFor,
    workspace,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GranolaTuiWorkspace", () => {
  test("moves between folders and loads the scoped meeting list", async () => {
    const harness = createWorkspaceHarness();

    await harness.workspace.initialise();
    harness.workspace.handleInput("h");
    harness.workspace.handleInput("j");
    await harness.waitFor(() => harness.getMeeting.mock.lastCall?.[0] === "doc-bravo-2222");

    expect(harness.listMeetings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        folderId: "folder-sales-2222",
        limit: 200,
        preferIndex: true,
      }),
    );
    expect(harness.getMeeting).toHaveBeenLastCalledWith("doc-bravo-2222");

    const rendered = harness.workspace.render(100).join("\n");
    expect(rendered).toContain("Opened Bravo Review");
    expect(rendered).toContain("Bravo Review");
    expect(rendered).toContain("Sales");
  });

  test("opens quick open and jumps to a picked meeting", async () => {
    const harness = createWorkspaceHarness();

    await harness.workspace.initialise();
    harness.workspace.handleInput("/");

    const palette = harness.host.overlayComponent;
    expect(palette).toBeInstanceOf(GranolaTuiQuickOpenPalette);
    if (!(palette instanceof GranolaTuiQuickOpenPalette)) {
      throw new Error("expected quick-open palette overlay");
    }

    palette.handleInput("b");
    palette.handleInput("\n");
    await harness.flush();

    expect(harness.host.overlayComponent).toBeUndefined();
    expect(harness.getMeeting).toHaveBeenLastCalledWith("doc-bravo-2222");
    expect(harness.workspace.render(100).join("\n")).toContain("Bravo Review");
  });

  test("uses quick open query resolution when no local match exists", async () => {
    const harness = createWorkspaceHarness();

    await harness.workspace.initialise();
    harness.workspace.handleInput("/");

    const palette = harness.host.overlayComponent;
    expect(palette).toBeInstanceOf(GranolaTuiQuickOpenPalette);
    if (!(palette instanceof GranolaTuiQuickOpenPalette)) {
      throw new Error("expected quick-open palette overlay");
    }

    for (const character of "bravox") {
      palette.handleInput(character);
    }
    palette.handleInput("\n");
    await harness.flush();

    expect(harness.findMeeting).toHaveBeenCalledWith("bravox");
    expect(harness.workspace.render(100).join("\n")).toContain("Bravo Review");
  });

  test("switches detail tabs with hotkeys and cycling", async () => {
    const harness = createWorkspaceHarness();

    await harness.workspace.initialise();

    expect(harness.workspace.render(100).join("\n")).toContain("# Alpha Sync");

    harness.workspace.handleInput("2");
    expect(harness.workspace.render(100).join("\n")).toContain("[09:00:01] You: Hello team");

    harness.workspace.handleInput("]");
    expect(harness.workspace.render(100).join("\n")).toContain("Notes source: notes");

    harness.workspace.handleInput("4");
    expect(harness.workspace.render(100).join("\n")).toContain('"cacheData"');

    harness.workspace.handleInput("[");
    expect(harness.workspace.render(100).join("\n")).toContain("Notes source: notes");
  });

  test("surfaces refresh failures and recovers on the next refresh", async () => {
    const harness = createWorkspaceHarness({ failNextRefresh: true });

    await harness.workspace.initialise();

    harness.workspace.handleInput("r");
    await harness.flush();

    expect(harness.workspace.render(100).join("\n")).toContain("live refresh failed");
    expect(harness.listFolders).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forceRefresh: true,
      }),
    );

    harness.workspace.handleInput("r");
    await harness.flush();

    expect(harness.listMeetings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forceRefresh: true,
        limit: 200,
        preferIndex: true,
      }),
    );
    const rendered = harness.workspace.render(100).join("\n");
    expect(rendered).toContain("Opened Alpha Sync");
    expect(rendered).not.toContain("live refresh failed");
  });

  test("opens automation runs and resolves a pending item", async () => {
    const harness = createWorkspaceHarness({
      automationRuns: [
        {
          actionId: "review",
          actionKind: "ask-user",
          actionName: "Review transcript",
          id: "sync-1:1:review",
          prompt: "Review the transcript before sharing it",
          status: "pending",
          title: "Alpha Sync",
        },
      ],
    });

    await harness.workspace.initialise();
    harness.workspace.handleInput("u");

    const overlay = harness.host.overlayComponent;
    expect(overlay).toBeInstanceOf(GranolaTuiAutomationOverlay);
    if (!(overlay instanceof GranolaTuiAutomationOverlay)) {
      throw new Error("expected automation overlay");
    }

    overlay.handleInput("\n");
    await harness.flush();

    expect(harness.resolveAutomationRun).toHaveBeenCalledWith("sync-1:1:review", "approve");
  });

  test("prefers generated artefacts in the automation review overlay", async () => {
    const harness = createWorkspaceHarness({
      automationArtefacts: [
        {
          id: "notes:sync-1:pipeline-notes",
          status: "generated",
          title: "Alpha Sync Notes",
        },
      ],
      automationRuns: [
        {
          actionId: "review",
          actionKind: "ask-user",
          actionName: "Review transcript",
          id: "sync-1:1:review",
          prompt: "Review the transcript before sharing it",
          status: "pending",
          title: "Alpha Sync",
        },
      ],
    });

    await harness.workspace.initialise();
    harness.workspace.handleInput("u");

    const overlay = harness.host.overlayComponent;
    expect(overlay).toBeInstanceOf(GranolaTuiAutomationOverlay);
    if (!(overlay instanceof GranolaTuiAutomationOverlay)) {
      throw new Error("expected automation overlay");
    }

    overlay.handleInput("\n");
    await harness.flush();

    expect(harness.resolveAutomationArtefact).toHaveBeenCalledWith(
      "notes:sync-1:pipeline-notes",
      "approve",
    );
  });

  test("recovers processing issues from the automation overlay", async () => {
    const harness = createWorkspaceHarness({
      processingIssues: [
        {
          id: "sync-stale:::",
          kind: "sync-stale",
          severity: "error",
          title: "Sync needs attention",
        },
      ],
    });

    await harness.workspace.initialise();
    harness.workspace.handleInput("u");

    const overlay = harness.host.overlayComponent;
    expect(overlay).toBeInstanceOf(GranolaTuiAutomationOverlay);
    if (!(overlay instanceof GranolaTuiAutomationOverlay)) {
      throw new Error("expected automation overlay");
    }

    overlay.handleInput("\n");
    await harness.flush();

    expect(harness.recoverProcessingIssue).toHaveBeenCalledWith("sync-stale:::");
  });
});
