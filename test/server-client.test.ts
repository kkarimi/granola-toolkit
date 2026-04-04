import { afterEach, describe, expect, test } from "vite-plus/test";

import { GranolaApp } from "../src/app/core.ts";
import type { GranolaAppStateEvent } from "../src/app/index.ts";
import { createGranolaServerClient } from "../src/server/client.ts";
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

function createTestApp(): GranolaApp {
  return new GranolaApp(
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
      },
      now: () => new Date("2024-03-01T12:00:00Z"),
    },
    { surface: "server" },
  );
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
    const app = createTestApp();
    const server = await startGranolaServer(app);
    closeServer = async () => await server.close();

    const client = await createGranolaServerClient(server.url);
    closeClient = async () => await client.close();

    expect(client.getState().ui.surface).toBe("server");

    const eventPromise = waitForStateUpdate(
      (listener) => client.subscribe(listener),
      (event) => event.state.ui.view === "meeting-list",
    );

    const meetings = await client.listMeetings({
      limit: 5,
      search: "alpha",
    });
    expect(meetings).toEqual(
      expect.objectContaining({
        meetings: [expect.objectContaining({ id: "doc-alpha-1111" })],
        source: "live",
      }),
    );

    const event = await eventPromise;
    expect(event.state.ui.view).toBe("meeting-list");

    const meeting = await client.findMeeting("Alpha Sync");
    expect(meeting).toEqual(
      expect.objectContaining({
        document: expect.objectContaining({
          id: "doc-alpha-1111",
        }),
        meeting: expect.objectContaining({
          noteMarkdown: expect.stringContaining("# Alpha Sync"),
        }),
      }),
    );
  });

  test("supports password-protected attach flows", async () => {
    const app = createTestApp();
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
    expect(meeting.document.id).toBe("doc-alpha-1111");
  });
});
