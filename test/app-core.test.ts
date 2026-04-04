import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import { MemoryExportJobStore } from "../src/export-jobs.ts";
import { MemoryMeetingIndexStore } from "../src/meeting-index.ts";
import type { GranolaAppAuthState } from "../src/app/index.ts";
import type { CacheData, GranolaDocument } from "../src/types.ts";

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
    expect(result.written).toBe(1);
    expect(markdown).toContain("# Alpha Sync");
    expect(state.exports.notes).toEqual(
      expect.objectContaining({
        format: "markdown",
        itemCount: 1,
        jobId: result.job.id,
        outputDir,
        written: 1,
      }),
    );
    expect(state.exports.jobs[0]).toEqual(
      expect.objectContaining({
        completedCount: 1,
        id: result.job.id,
        kind: "notes",
        status: "completed",
      }),
    );
    expect(await jobStore.readJobs()).toHaveLength(1);
    expect(state.ui.view).toBe("notes-export");
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

  test("uses the local meeting index as a fast path for web surfaces", async () => {
    const listDocuments = vi.fn(async () => documents);
    const meetingIndexStore = new MemoryMeetingIndexStore();
    await meetingIndexStore.writeIndex([
      {
        createdAt: "2024-01-01T09:00:00Z",
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
