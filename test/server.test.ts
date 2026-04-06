import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import type { GranolaAppAuthState } from "../src/app/index.ts";
import { MemoryExportJobStore } from "../src/export-jobs.ts";
import { MemoryMeetingIndexStore } from "../src/meeting-index.ts";
import { MemorySyncEventStore } from "../src/sync-events.ts";
import { startGranolaServer } from "../src/server/http.ts";
import { GRANOLA_TRANSPORT_PROTOCOL_VERSION } from "../src/transport.ts";
import { granolaWebAssetPaths } from "../src/web/assets.ts";
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
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
        syncEventStore: new MemorySyncEventStore(),
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

    const serverInfo = await fetch(new URL("/server/info", server.url));
    expect(serverInfo.ok).toBe(true);
    expect(await serverInfo.json()).toEqual(
      expect.objectContaining({
        build: expect.objectContaining({
          packageName: "granola-toolkit",
          version: expect.any(String),
        }),
        capabilities: expect.objectContaining({
          attach: true,
          auth: true,
          events: true,
          folders: true,
          webClient: false,
        }),
        persistence: expect.objectContaining({
          exportJobs: true,
          meetingIndex: true,
          syncEvents: true,
          syncState: true,
        }),
        product: "granola-toolkit",
        protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
        runtime: expect.objectContaining({
          startedAt: expect.any(String),
        }),
        transport: "local-http",
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
        source: "live",
      }),
    );

    const folderList = await fetch(new URL("/folders?search=team&limit=5", server.url));
    expect(folderList.ok).toBe(true);
    expect(await folderList.json()).toEqual(
      expect.objectContaining({
        folders: [expect.objectContaining({ id: "folder-team-1111", name: "Team" })],
        search: "team",
      }),
    );

    const folder = await fetch(new URL("/folders/folder-team-1111", server.url));
    expect(folder.ok).toBe(true);
    expect(await folder.json()).toEqual(
      expect.objectContaining({
        id: "folder-team-1111",
        meetings: [expect.objectContaining({ id: "doc-alpha-1111" })],
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

  test("serves persisted sync events", async () => {
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
          listDocuments: async () => documents,
          listFolders: async () => folders,
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
        syncEventStore: new MemorySyncEventStore(),
      },
      { surface: "server" },
    );
    await app.sync();

    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const response = await fetch(new URL("/sync/events?limit=5", server.url));
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({
      events: expect.arrayContaining([
        expect.objectContaining({
          kind: "meeting.created",
          meetingId: "doc-alpha-1111",
        }),
      ]),
    });
  });

  test("streams state updates and handles export requests", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "granola-server-notes-"));
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
          listFolders: async () => folders,
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

    await app.listDocuments();
    const secondChunk = await readSseChunk(reader!);
    expect(secondChunk).toContain("event: state.updated");
    expect(secondChunk).toContain('"documents":{"count":1,"loaded":true');
    await reader!.cancel();

    const exportResponse = await fetch(new URL("/exports/notes", server.url), {
      body: JSON.stringify({
        folderId: "folder-team-1111",
        format: "markdown",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(exportResponse.status).toBe(202);
    expect(await exportResponse.json()).toEqual(
      expect.objectContaining({
        documentCount: 1,
        job: expect.objectContaining({
          kind: "notes",
          scope: {
            folderId: "folder-team-1111",
            folderName: "Team",
            mode: "folder",
          },
          status: "completed",
        }),
        outputDir: expect.stringContaining("_folders/folder-team-1111"),
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
        written: 1,
      }),
    );

    const markdown = await readFile(
      join(outputDir, "_folders", "folder-team-1111", "Alpha Sync.md"),
      "utf8",
    );
    expect(markdown).toContain("# Alpha Sync");

    const jobsResponse = await fetch(new URL("/exports/jobs?limit=10", server.url));
    expect(jobsResponse.ok).toBe(true);
    const jobsPayload = (await jobsResponse.json()) as {
      jobs: Array<{ id: string; kind: string }>;
    };
    expect(jobsPayload.jobs[0]).toEqual(
      expect.objectContaining({
        kind: "notes",
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
      }),
    );

    const rerunResponse = await fetch(
      new URL(`/exports/jobs/${jobsPayload.jobs[0]!.id}/rerun`, server.url),
      {
        method: "POST",
      },
    );
    expect(rerunResponse.status).toBe(202);
    expect(await rerunResponse.json()).toEqual(
      expect.objectContaining({
        documentCount: 1,
        job: expect.objectContaining({
          kind: "notes",
          status: "completed",
        }),
      }),
    );

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
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: true,
          supabasePath: "/tmp/supabase.json",
        },
        cacheLoader: async () => cacheData,
        granolaClient: {
          listDocuments: async () => documents,
          listFolders: async () => folders,
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
    expect(html).toContain('<div id="granola-web-root"></div>');
    expect(html).toContain('"passwordRequired":false');
    expect(html).toContain(`href="${granolaWebAssetPaths.stylesheet}"`);
    expect(html).toContain(`src="${granolaWebAssetPaths.script}"`);

    const stylesheet = await fetch(new URL(granolaWebAssetPaths.stylesheet, server.url));
    expect(stylesheet.ok).toBe(true);
    expect(stylesheet.headers.get("content-type")).toContain("text/css");
    expect(await stylesheet.text()).toContain(".shell");

    const script = await fetch(new URL(granolaWebAssetPaths.script, server.url));
    expect(script.ok).toBe(true);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await script.text()).toContain("Granola Toolkit");
  });

  test("supports meeting filters and quick-open routes", async () => {
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
          listDocuments: async () => [
            ...documents,
            {
              content: "Pipeline fallback",
              createdAt: "2024-02-02T09:00:00Z",
              id: "doc-charlie-3333",
              notesPlain: "",
              tags: ["sales", "ops"],
              title: "Charlie Pipeline",
              updatedAt: "2024-02-05T11:00:00Z",
            },
          ],
        },
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const server = await startGranolaServer(app, {
      enableWebClient: true,
    });
    closeServer = async () => await server.close();

    const filtered = await fetch(
      new URL(
        "/meetings?limit=10&sort=title-desc&updatedFrom=2024-02-05&updatedTo=2024-02-05",
        server.url,
      ),
    );
    expect(filtered.ok).toBe(true);
    expect(await filtered.json()).toEqual(
      expect.objectContaining({
        meetings: [expect.objectContaining({ id: "doc-charlie-3333" })],
        source: "live",
        sort: "title-desc",
        updatedFrom: "2024-02-05",
        updatedTo: "2024-02-05",
      }),
    );

    const resolved = await fetch(new URL("/meetings/resolve?q=Charlie%20Pipeline", server.url));
    expect(resolved.ok).toBe(true);
    expect(await resolved.json()).toEqual(
      expect.objectContaining({
        document: expect.objectContaining({
          id: "doc-charlie-3333",
        }),
      }),
    );
  });

  test("serves auth status and auth actions over HTTP", async () => {
    let authState: GranolaAppAuthState = {
      mode: "supabase-file",
      refreshAvailable: false,
      storedSessionAvailable: false,
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
          login: async () => {
            authState = {
              ...authState,
              mode: "stored-session",
              refreshAvailable: true,
              storedSessionAvailable: true,
            };
            return authState;
          },
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

    const initial = await fetch(new URL("/auth/status", server.url));
    expect(initial.ok).toBe(true);
    expect(await initial.json()).toEqual(
      expect.objectContaining({
        mode: "supabase-file",
        storedSessionAvailable: false,
      }),
    );

    const login = await fetch(new URL("/auth/login", server.url), {
      method: "POST",
    });
    expect(login.ok).toBe(true);
    expect(await login.json()).toEqual(
      expect.objectContaining({
        mode: "stored-session",
        refreshAvailable: true,
      }),
    );

    const switchMode = await fetch(new URL("/auth/mode", server.url), {
      body: JSON.stringify({ mode: "supabase-file" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(switchMode.ok).toBe(true);
    expect(await switchMode.json()).toEqual(
      expect.objectContaining({
        mode: "supabase-file",
      }),
    );

    const refresh = await fetch(new URL("/auth/refresh", server.url), {
      method: "POST",
    });
    expect(refresh.status).toBe(400);
    expect(await refresh.json()).toEqual(
      expect.objectContaining({
        error: "refresh failed",
      }),
    );

    const refreshedState = await fetch(new URL("/state", server.url));
    expect(await refreshedState.json()).toEqual(
      expect.objectContaining({
        auth: expect.objectContaining({
          lastError: "refresh failed",
        }),
      }),
    );

    const logout = await fetch(new URL("/auth/logout", server.url), {
      method: "POST",
    });
    expect(logout.ok).toBe(true);
    expect(await logout.json()).toEqual(
      expect.objectContaining({
        mode: "supabase-file",
        storedSessionAvailable: false,
      }),
    );
  });

  test("serves indexed meetings and can force a live refresh", async () => {
    const listDocuments = async () => documents;
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
        granolaClient: { listDocuments },
        meetingIndex: await meetingIndexStore.readIndex(),
        meetingIndexStore,
        now: () => new Date("2024-03-01T12:00:00Z"),
      },
      { surface: "web" },
    );

    const server = await startGranolaServer(app, {
      enableWebClient: true,
    });
    closeServer = async () => await server.close();

    const indexed = await fetch(new URL("/meetings?limit=10", server.url));
    expect(indexed.ok).toBe(true);
    expect(await indexed.json()).toEqual(
      expect.objectContaining({
        meetings: [expect.objectContaining({ id: "doc-alpha-1111" })],
        source: "index",
      }),
    );

    const refreshed = await fetch(new URL("/meetings?limit=10&refresh=true", server.url));
    expect(refreshed.ok).toBe(true);
    expect(await refreshed.json()).toEqual(
      expect.objectContaining({
        meetings: [expect.objectContaining({ id: "doc-alpha-1111" })],
        refresh: true,
        source: "live",
      }),
    );
  });

  test("protects API routes with a password and trusted origins", async () => {
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

    const server = await startGranolaServer(app, {
      enableWebClient: true,
      security: {
        password: "secret-pass",
        trustedOrigins: ["https://trusted.example"],
      },
    });
    closeServer = async () => await server.close();

    const root = await fetch(new URL("/", server.url));
    expect(root.ok).toBe(true);
    expect(await root.text()).toContain('"passwordRequired":true');

    const locked = await fetch(new URL("/state", server.url));
    expect(locked.status).toBe(401);
    expect(await locked.json()).toEqual(
      expect.objectContaining({
        authRequired: true,
        error: "server password required",
      }),
    );

    const wrongUnlock = await fetch(new URL("/auth/unlock", server.url), {
      body: JSON.stringify({ password: "wrong-pass" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(wrongUnlock.status).toBe(401);

    const unlock = await fetch(new URL("/auth/unlock", server.url), {
      body: JSON.stringify({ password: "secret-pass" }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(unlock.ok).toBe(true);
    const cookie = unlock.headers.get("set-cookie");
    expect(cookie).toContain("granola_toolkit_password=");

    const unlocked = await fetch(new URL("/state", server.url), {
      headers: {
        cookie: cookie ?? "",
      },
    });
    expect(unlocked.ok).toBe(true);

    const trustedPreflight = await fetch(new URL("/state", server.url), {
      headers: {
        "access-control-request-method": "GET",
        origin: "https://trusted.example",
      },
      method: "OPTIONS",
    });
    expect(trustedPreflight.status).toBe(204);
    expect(trustedPreflight.headers.get("access-control-allow-origin")).toBe(
      "https://trusted.example",
    );

    const untrusted = await fetch(new URL("/state", server.url), {
      headers: {
        origin: "https://evil.example",
      },
    });
    expect(untrusted.status).toBe(403);

    const lockedAgain = await fetch(new URL("/auth/lock", server.url), {
      headers: {
        cookie: cookie ?? "",
      },
      method: "POST",
    });
    expect(lockedAgain.ok).toBe(true);
    expect(lockedAgain.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
