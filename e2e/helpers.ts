import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { GranolaApp } from "../src/app/core.ts";
import { startGranolaServer } from "../src/server/http.ts";
import { MemorySyncEventStore } from "../src/sync-events.ts";
import type { CacheData, GranolaDocument, GranolaFolder } from "../src/types.ts";

interface StartedServer {
  close(): Promise<void>;
  url: string;
}

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
  {
    content: "Fallback beta note body",
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
    tags: ["ops"],
    title: "Beta Review",
    updatedAt: "2024-01-04T10:00:00Z",
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
    "doc-beta-2222": {
      createdAt: "2024-01-02T09:00:00Z",
      id: "doc-beta-2222",
      title: "Beta Review",
      updatedAt: "2024-01-04T10:00:00Z",
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
  {
    createdAt: "2024-01-01T08:00:00Z",
    documentIds: ["doc-beta-2222"],
    id: "folder-ops-2222",
    isFavourite: false,
    name: "Ops",
    updatedAt: "2024-01-05T10:00:00Z",
    workspaceId: "workspace-1",
  },
];

function contentTypeForPath(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = server.address();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (!address || typeof address === "string") {
    throw new Error("failed to resolve a free port");
  }

  return address.port;
}

async function waitForHttpReady(url: string, options: { timeoutMs?: number } = {}): Promise<void> {
  const timeoutAt = Date.now() + (options.timeoutMs ?? 30_000);

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await delay(250);
  }

  throw new Error(`timed out waiting for ${url}`);
}

export async function startToolkitWebServer(): Promise<StartedServer> {
  const outputRoot = await mkdtemp(join(tmpdir(), "granola-playwright-"));
  const app = new GranolaApp(
    {
      debug: false,
      notes: {
        output: join(outputRoot, "notes"),
        timeoutMs: 120_000,
      },
      supabase: "/tmp/supabase.json",
      transcripts: {
        cacheFile: "",
        output: join(outputRoot, "transcripts"),
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
      cacheLoader: async () => cacheData,
      granolaClient: {
        listDocuments: async () => documents,
        listFolders: async () => folders,
      },
      now: () => new Date("2024-03-01T12:00:00Z"),
      syncEventStore: new MemorySyncEventStore(),
    },
    { surface: "web" },
  );

  await app.sync();
  const server = await startGranolaServer(app, {
    enableWebClient: true,
  });

  return {
    async close() {
      await server.close();
    },
    url: server.url.href,
  };
}

export async function startDocsServer(): Promise<StartedServer> {
  const port = await getAvailablePort();
  const url = `http://127.0.0.1:${port}`;
  const rootDir = resolve(process.cwd(), "docs", "out");

  async function resolveStaticFile(pathname: string): Promise<string | undefined> {
    const relativePath = pathname.replace(/^\/+/, "");
    const candidates = [
      resolve(rootDir, relativePath),
      resolve(rootDir, `${relativePath}.html`),
      resolve(rootDir, relativePath, "index.html"),
    ];

    for (const candidate of candidates) {
      if (!candidate.startsWith(rootDir)) {
        continue;
      }

      try {
        const fileStat = await stat(candidate);
        if (fileStat.isFile()) {
          return candidate;
        }
      } catch {}
    }

    return undefined;
  }

  const server = createHttpServer(
    async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
      const requestUrl = new URL(request.url ?? "/", url);
      const filePath = await resolveStaticFile(requestUrl.pathname);
      if (!filePath) {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }

      const body = await readFile(filePath);
      response.setHeader("content-type", contentTypeForPath(filePath));
      response.end(body);
    },
  );

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolvePromise();
    });
  });
  await waitForHttpReady(url);

  return {
    async close() {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      });
    },
    url,
  };
}
