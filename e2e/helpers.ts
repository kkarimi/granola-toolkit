import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { MemoryAgentHarnessStore } from "../src/agent-harnesses.ts";
import { GranolaApp } from "../src/app/core.ts";
import type { GranolaAppAuthState } from "../src/app/index.ts";
import { MemoryAutomationRuleStore } from "../src/automation-rules.ts";
import { startGranolaServer } from "../src/server/http.ts";
import { MemorySyncEventStore } from "../src/sync-events.ts";
import type { CacheData, GranolaDocument, GranolaFolder } from "../src/types.ts";

interface StartedServer {
  close(): Promise<void>;
  url: string;
}

interface StartToolkitWebServerOptions {
  scenario?: "cold-start" | "workspace";
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

function createInMemoryAuthController(initialState: GranolaAppAuthState) {
  let authState = structuredClone(initialState);

  return {
    async clearApiKey() {
      authState = {
        ...authState,
        apiKeyAvailable: false,
        lastError: undefined,
        mode: authState.storedSessionAvailable
          ? "stored-session"
          : authState.supabaseAvailable
            ? "supabase-file"
            : "api-key",
      };
      return structuredClone(authState);
    },
    async inspect() {
      return structuredClone(authState);
    },
    async login(options: { apiKey?: string } = {}) {
      authState = {
        ...authState,
        apiKeyAvailable: Boolean(options.apiKey?.trim()) || authState.apiKeyAvailable,
        lastError: undefined,
        mode: options.apiKey?.trim() ? "api-key" : "stored-session",
        storedSessionAvailable: options.apiKey?.trim() ? authState.storedSessionAvailable : true,
      };
      return structuredClone(authState);
    },
    async logout() {
      authState = {
        ...authState,
        apiKeyAvailable: false,
        lastError: undefined,
        mode: authState.supabaseAvailable ? "supabase-file" : "api-key",
        storedSessionAvailable: false,
      };
      return structuredClone(authState);
    },
    async refresh() {
      if (!authState.storedSessionAvailable) {
        authState = {
          ...authState,
          lastError: "no stored Granola session found",
        };
        throw new Error(authState.lastError);
      }

      authState = {
        ...authState,
        lastError: undefined,
      };
      return structuredClone(authState);
    },
    async switchMode(mode: GranolaAppAuthState["mode"]) {
      if (mode === "api-key" && !authState.apiKeyAvailable) {
        authState = {
          ...authState,
          lastError: "no Granola API key found",
        };
        throw new Error(authState.lastError);
      }
      if (mode === "stored-session" && !authState.storedSessionAvailable) {
        authState = {
          ...authState,
          lastError: "no stored Granola session found",
        };
        throw new Error(authState.lastError);
      }
      if (mode === "supabase-file" && !authState.supabaseAvailable) {
        authState = {
          ...authState,
          lastError: "supabase.json not found",
        };
        throw new Error(authState.lastError);
      }

      authState = {
        ...authState,
        lastError: undefined,
        mode,
      };
      return structuredClone(authState);
    },
  };
}

export async function startToolkitWebServer(
  options: StartToolkitWebServerOptions = {},
): Promise<StartedServer> {
  const scenario = options.scenario ?? "workspace";
  const outputRoot = await mkdtemp(join(tmpdir(), "granola-playwright-"));
  const cacheFile = join(outputRoot, "cache.json");
  await writeFile(cacheFile, `${JSON.stringify(cacheData)}\n`, "utf8");

  const initialAuthState: GranolaAppAuthState =
    scenario === "cold-start"
      ? {
          apiKeyAvailable: false,
          mode: "api-key",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: false,
        }
      : {
          apiKeyAvailable: true,
          mode: "api-key",
          refreshAvailable: false,
          storedSessionAvailable: false,
          supabaseAvailable: false,
        };
  const authController = createInMemoryAuthController(initialAuthState);

  const app = new GranolaApp(
    {
      debug: false,
      notes: {
        output: join(outputRoot, "notes"),
        timeoutMs: 120_000,
      },
      plugins: {
        enabled: {
          automation: scenario !== "cold-start",
          "markdown-viewer": true,
        },
        settingsFile: join(outputRoot, "plugins.json"),
        sources: {
          automation: "config",
          "markdown-viewer": "config",
        },
      },
      supabase: "/tmp/supabase.json",
      transcripts: {
        cacheFile,
        output: join(outputRoot, "transcripts"),
      },
    },
    {
      auth: initialAuthState,
      authController,
      agentHarnessStore: new MemoryAgentHarnessStore(
        scenario === "cold-start"
          ? []
          : [
              {
                id: "team-notes",
                match: {
                  folderNames: ["Team"],
                  transcriptLoaded: true,
                },
                name: "Team Notes",
                prompt: "Write concise internal team notes.",
                provider: "codex",
              },
            ],
      ),
      agentRunner: {
        run: async (request) => ({
          dryRun: false,
          model: request.model ?? "gpt-5-codex",
          output: JSON.stringify({
            actionItems: [],
            decisions: [],
            followUps: [],
            highlights: [],
            markdown: "# Team Notes",
            sections: [{ body: "Team summary", title: "Summary" }],
            summary: "Team summary",
            title: "Team Notes",
          }),
          prompt: request.prompt,
          provider: request.provider ?? "codex",
        }),
      },
      automationRuleStore: new MemoryAutomationRuleStore(
        scenario === "cold-start"
          ? []
          : [
              {
                actions: [
                  {
                    approvalMode: "manual",
                    harnessId: "team-notes",
                    id: "team-notes-pipeline",
                    kind: "agent",
                    name: "Generate team notes",
                    pipeline: {
                      kind: "notes",
                    },
                  },
                ],
                id: "team-notes-on-transcript",
                name: "Review team notes when a transcript is ready",
                when: {
                  eventKinds: ["transcript.ready"],
                  folderNames: ["Team"],
                  transcriptLoaded: true,
                },
              },
            ],
      ),
      cacheLoader: async () => cacheData,
      createGranolaClient: async (mode) => {
        const auth = await authController.inspect();
        const activeMode = mode ?? auth.mode;
        if (activeMode === "api-key" && !auth.apiKeyAvailable) {
          throw new Error("Granola API key required");
        }
        if (activeMode === "stored-session" && !auth.storedSessionAvailable) {
          throw new Error("Granola desktop session required");
        }
        if (activeMode === "supabase-file" && !auth.supabaseAvailable) {
          throw new Error("supabase.json not available");
        }

        return {
          auth: {
            ...auth,
            mode: activeMode,
          },
          client: {
            listDocuments: async () => documents,
            listFolders: async () => folders,
          },
        };
      },
      now: () => new Date("2024-03-01T12:00:00Z"),
      syncEventStore: new MemorySyncEventStore(),
    },
    { surface: "web" },
  );

  if (scenario !== "cold-start") {
    await app.sync();
  }
  const server = await startGranolaServer(app, {
    enableWebClient: true,
    runtime: {
      mode: "background-service",
      syncEnabled: true,
      syncIntervalMs: 60_000,
    },
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
