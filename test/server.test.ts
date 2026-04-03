import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import { startGranolaServer } from "../src/server/http.ts";
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

const decoder = new TextDecoder();

async function readSseChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { done, value } = await reader.read();
  if (done || !value) {
    return "";
  }

  return decoder.decode(value);
}

describe("startGranolaServer", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  test("serves state and meeting endpoints from a shared app instance", async () => {
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
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const health = await fetch(new URL("/health", server.url));
    expect(health.ok).toBe(true);
    expect(await health.json()).toEqual(
      expect.objectContaining({
        ok: true,
        service: "granola-toolkit",
      }),
    );

    const state = await fetch(new URL("/state", server.url));
    expect(state.ok).toBe(true);
    expect(await state.json()).toEqual(
      expect.objectContaining({
        ui: expect.objectContaining({
          surface: "server",
        }),
      }),
    );

    const meetings = await fetch(new URL("/meetings?search=alpha&limit=5", server.url));
    expect(meetings.ok).toBe(true);
    expect(await meetings.json()).toEqual(
      expect.objectContaining({
        meetings: [
          expect.objectContaining({
            id: "doc-alpha-1111",
            title: "Alpha Sync",
          }),
        ],
        search: "alpha",
      }),
    );

    const meeting = await fetch(new URL("/meetings/doc-alpha", server.url));
    expect(meeting.ok).toBe(true);
    expect(await meeting.json()).toEqual(
      expect.objectContaining({
        document: expect.objectContaining({
          id: "doc-alpha-1111",
        }),
        meeting: expect.objectContaining({
          noteMarkdown: expect.stringContaining("# Alpha Sync"),
        }),
      }),
    );

    const root = await fetch(new URL("/", server.url));
    expect(root.status).toBe(404);
  });

  test("streams state updates and handles export requests", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-server-notes-"));
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
        granolaClient: {
          listDocuments: async () => documents,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "server" },
    );

    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const eventsResponse = await fetch(new URL("/events", server.url));
    expect(eventsResponse.ok).toBe(true);
    const reader = eventsResponse.body?.getReader();
    expect(reader).toBeDefined();

    const firstChunk = await readSseChunk(reader!);
    expect(firstChunk).toContain("event: state.updated");
    expect(firstChunk).toContain('"surface":"server"');

    app.setUiState({ view: "meeting-list" });
    const secondChunk = await readSseChunk(reader!);
    expect(secondChunk).toContain("event: state.updated");
    expect(secondChunk).toContain('"view":"meeting-list"');

    const exportResponse = await fetch(new URL("/exports/notes", server.url), {
      body: JSON.stringify({ format: "markdown" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(exportResponse.status).toBe(202);
    expect(await exportResponse.json()).toEqual(
      expect.objectContaining({
        documentCount: 1,
        written: 1,
      }),
    );

    const markdown = await readFile(join(outputDir, "Alpha Sync.md"), "utf8");
    expect(markdown).toContain("# Alpha Sync");

    await reader?.cancel();
  });

  test("serves the browser client when enabled", async () => {
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
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const server = await startGranolaServer(app, {
      enableWebClient: true,
    });
    closeServer = async () => await server.close();

    const response = await fetch(new URL("/", server.url));
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("<title>Granola Toolkit</title>");
    expect(html).toContain("Meeting Workspace");
    expect(html).toContain('new EventSource("/events")');
  });
});
