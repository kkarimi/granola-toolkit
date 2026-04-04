import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import { MemoryExportJobStore } from "../src/export-jobs.ts";
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
          storedSessionAvailable: false,
          supabasePath: "/tmp/supabase.json",
        },
        cacheLoader: loadCache,
        granolaClient: { listDocuments },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
    );

    const list = await app.listMeetings({ limit: 10, search: "alpha" });
    const meeting = await app.getMeeting("doc-alpha");

    expect(list).toHaveLength(1);
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
          storedSessionAvailable: false,
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
          storedSessionAvailable: false,
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
          storedSessionAvailable: false,
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

    expect(list).toHaveLength(1);
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
});
