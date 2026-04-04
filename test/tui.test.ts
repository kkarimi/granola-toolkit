import { describe, expect, test } from "vite-plus/test";

import type {
  GranolaAppAuthState,
  GranolaMeetingBundle,
  MeetingSummaryRecord,
} from "../src/app/index.ts";
import { buildGranolaTuiAuthActions, renderGranolaTuiAuthState } from "../src/tui/auth.ts";
import {
  buildGranolaTuiQuickOpenItems,
  buildGranolaTuiSummary,
  renderGranolaTuiMeetingTab,
} from "../src/tui/helpers.ts";
import type { CacheData, GranolaDocument } from "../src/types.ts";

const meetings: MeetingSummaryRecord[] = [
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
    transcriptSegmentCount: 2,
    updatedAt: "2024-01-03T10:00:00Z",
  },
  {
    createdAt: "2024-02-01T09:00:00Z",
    folders: [],
    id: "doc-bravo-2222",
    noteContentSource: "content",
    tags: ["sales"],
    title: "Bravo Review",
    transcriptLoaded: false,
    transcriptSegmentCount: 0,
    updatedAt: "2024-02-05T12:00:00Z",
  },
];

const document: GranolaDocument = {
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
};

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

const bundle: GranolaMeetingBundle = {
  cacheData,
  document,
  meeting: {
    meeting: meetings[0]!,
    note: {
      content: "Alpha notes",
      contentSource: "notes",
      createdAt: document.createdAt,
      id: document.id,
      tags: document.tags,
      title: document.title,
      updatedAt: document.updatedAt,
    },
    noteMarkdown: "# Alpha Sync\n\nAlpha notes",
    transcript: {
      createdAt: document.createdAt,
      id: document.id,
      segments: [
        {
          endTimestamp: "2024-01-01T09:00:03Z",
          id: "segment-1",
          isFinal: true,
          source: "microphone",
          speaker: "You",
          startTimestamp: "2024-01-01T09:00:01Z",
          text: "Hello team",
        },
      ],
      title: document.title,
      updatedAt: document.updatedAt,
    },
    transcriptText: "[09:00:01] You: Hello team",
  },
};

const storedAuthState: GranolaAppAuthState = {
  clientId: "client_GranolaMac",
  mode: "stored-session",
  refreshAvailable: true,
  signInMethod: "google-oauth",
  storedSessionAvailable: true,
  supabaseAvailable: true,
  supabasePath: "/tmp/supabase.json",
};

const supabaseOnlyAuthState: GranolaAppAuthState = {
  lastError: "refresh failed",
  mode: "supabase-file",
  refreshAvailable: false,
  storedSessionAvailable: false,
  supabaseAvailable: true,
  supabasePath: "/tmp/supabase.json",
};

describe("buildGranolaTuiQuickOpenItems", () => {
  test("prioritises exact and prefix id matches ahead of broad title matches", () => {
    const items = buildGranolaTuiQuickOpenItems(meetings, "doc-alpha");

    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "doc-alpha-1111",
        label: "Alpha Sync",
      }),
    );
  });

  test("matches tags and returns descriptions with ids", () => {
    const items = buildGranolaTuiQuickOpenItems(meetings, "sales");

    expect(items).toHaveLength(1);
    expect(items[0]?.description).toContain("doc-bravo-2222");
  });

  test("surfaces recent meetings and workspace actions in the palette", () => {
    const items = buildGranolaTuiQuickOpenItems(meetings, "", {
      recentMeetingIds: ["doc-bravo-2222"],
    });

    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "doc-bravo-2222",
        kind: "meeting",
      }),
    );
    expect(items.some((item) => item.id === "sync" && item.kind === "action")).toBe(true);
    expect(items[0]?.description).toContain("Recent");
  });
});

describe("renderGranolaTuiMeetingTab", () => {
  test("renders metadata and transcript views for the TUI detail pane", () => {
    expect(renderGranolaTuiMeetingTab(bundle, "metadata")).toContain("Notes source: notes");
    expect(renderGranolaTuiMeetingTab(bundle, "metadata")).toContain("Folders: Team");
    expect(renderGranolaTuiMeetingTab(bundle, "transcript")).toContain("Hello team");
  });

  test("renders note and raw views", () => {
    expect(renderGranolaTuiMeetingTab(bundle, "notes")).toContain("# Alpha Sync");
    expect(renderGranolaTuiMeetingTab(bundle, "raw")).toContain('"meeting"');
  });
});

describe("buildGranolaTuiSummary", () => {
  test("includes folder status in the header summary", () => {
    const summary = buildGranolaTuiSummary(
      {
        auth: storedAuthState,
        automation: {
          loaded: true,
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
          documentCount: 1,
          filePath: "/tmp/cache.json",
          loaded: true,
          loadedAt: "2024-03-01T12:00:00Z",
          transcriptCount: 1,
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
          count: 3,
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
            folderCount: 3,
            meetingCount: 2,
            removedCount: 0,
            transcriptReadyCount: 0,
          },
        },
        ui: {
          surface: "tui",
          view: "meeting-list",
        },
      },
      "live",
    );

    expect(summary).toContain("3 folders");
    expect(summary).toContain("auth stored session");
    expect(summary).toContain("synced 12:00");
    expect(summary).toContain("source live");
  });
});

describe("buildGranolaTuiAuthActions", () => {
  test("enables the stored-session actions when a stored session exists", () => {
    const actions = buildGranolaTuiAuthActions(storedAuthState);

    expect(actions.find((action) => action.id === "refresh")).toEqual(
      expect.objectContaining({
        disabled: false,
      }),
    );
    expect(actions.find((action) => action.id === "use-stored")).toEqual(
      expect.objectContaining({
        disabled: true,
        disabledReason: "already active",
      }),
    );
  });

  test("disables stored-session actions when only supabase.json is available", () => {
    const actions = buildGranolaTuiAuthActions(supabaseOnlyAuthState);

    expect(actions.find((action) => action.id === "login")).toEqual(
      expect.objectContaining({
        disabled: false,
      }),
    );
    expect(actions.find((action) => action.id === "refresh")).toEqual(
      expect.objectContaining({
        disabled: true,
        disabledReason: "stored session missing",
      }),
    );
  });
});

describe("renderGranolaTuiAuthState", () => {
  test("renders the active auth mode and any last error", () => {
    const rendered = renderGranolaTuiAuthState(supabaseOnlyAuthState);

    expect(rendered).toContain("Active source: supabase.json");
    expect(rendered).toContain("Last error: refresh failed");
  });
});
