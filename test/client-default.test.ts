import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { MemorySessionStore } from "../src/client/auth.ts";
import { createDefaultGranolaRuntime, loadOptionalGranolaCache } from "../src/client/default.ts";
import * as authModule from "../src/client/auth.ts";
import type { AppConfig } from "../src/types.ts";

function createConfig(supabasePath?: string, apiKey?: string): AppConfig {
  return {
    apiKey,
    debug: false,
    notes: {
      output: "/tmp/notes",
      timeoutMs: 120_000,
    },
    supabase: supabasePath,
    transcripts: {
      cacheFile: "",
      output: "/tmp/transcripts",
    },
  };
}

async function writeTempFile(prefix: string, contents: string): Promise<string> {
  const filePath = join(
    tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  await writeFile(filePath, contents, "utf8");
  return filePath;
}

function documentResponse(id: string): Response {
  return new Response(
    JSON.stringify({
      docs: [
        {
          content: "",
          created_at: "2024-01-01T00:00:00Z",
          id,
          tags: [],
          title: `Document ${id}`,
          updated_at: "2024-01-02T00:00:00Z",
        },
      ],
    }),
    { status: 200 },
  );
}

function stubNoApiKeyStore() {
  vi.spyOn(authModule, "createDefaultApiKeyStore").mockReturnValue({
    async clearApiKey() {},
    async readApiKey() {
      return undefined;
    },
    async writeApiKey() {},
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createDefaultGranolaRuntime", () => {
  test("uses the supabase file token source when supabase mode is preferred", async () => {
    stubNoApiKeyStore();
    const fixture = await readFile(
      new URL("./fixtures/granola-supabase.fixture.json", import.meta.url),
      "utf8",
    );
    const supabasePath = await writeTempFile("granola-default-supabase", fixture);
    const store = new MemorySessionStore();
    await store.writeSession({
      accessToken: "stored-token",
      clientId: "client_GranolaMac",
      refreshToken: "stored-refresh",
    });

    vi.spyOn(authModule, "createDefaultSessionStore").mockReturnValue(store);

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer fixture-workos-access-token",
      });
      return documentResponse("doc-supabase");
    });
    vi.stubGlobal("fetch", fetchMock);

    const runtime = await createDefaultGranolaRuntime(
      createConfig(supabasePath),
      { warn: vi.fn() },
      {
        preferredMode: "supabase-file",
      },
    );

    expect(runtime.auth).toEqual(
      expect.objectContaining({
        mode: "supabase-file",
        storedSessionAvailable: true,
        supabaseAvailable: true,
      }),
    );

    const documents = await runtime.client.listDocuments({
      limit: 10,
      timeoutMs: 5_000,
    });

    expect(documents.map((document) => document.id)).toEqual(["doc-supabase"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("falls back from a stored session to supabase after a 401", async () => {
    stubNoApiKeyStore();
    const fixture = await readFile(
      new URL("./fixtures/granola-supabase.fixture.json", import.meta.url),
      "utf8",
    );
    const supabasePath = await writeTempFile("granola-default-fallback", fixture);
    const store = new MemorySessionStore();
    await store.writeSession({
      accessToken: "stored-token",
      clientId: "client_GranolaMac",
    });

    vi.spyOn(authModule, "createDefaultSessionStore").mockReturnValue(store);

    const fetchMock = vi
      .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(async (_url, init) => {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer stored-token",
        });
        return new Response("unauthorised", { status: 401, statusText: "Unauthorized" });
      })
      .mockImplementationOnce(async (_url, init) => {
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer fixture-workos-access-token",
        });
        return documentResponse("doc-fallback");
      });
    vi.stubGlobal("fetch", fetchMock);

    const runtime = await createDefaultGranolaRuntime(createConfig(supabasePath), {
      warn: vi.fn(),
    });
    const documents = await runtime.client.listDocuments({
      limit: 10,
      timeoutMs: 5_000,
    });

    expect(runtime.auth).toEqual(
      expect.objectContaining({
        mode: "stored-session",
        storedSessionAvailable: true,
      }),
    );
    expect(documents.map((document) => document.id)).toEqual(["doc-fallback"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(store.readSession()).resolves.toEqual(
      expect.objectContaining({
        accessToken: "fixture-workos-access-token",
        refreshToken: "fixture-workos-refresh-token",
      }),
    );
  });

  test("uses the public notes API when an API key is configured", async () => {
    vi.spyOn(authModule, "createDefaultApiKeyStore").mockReturnValue({
      async clearApiKey() {},
      async readApiKey() {
        return "grn_test_123";
      },
      async writeApiKey() {},
    });

    const fetchMock = vi
      .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(async (url, init) => {
        const requestUrl =
          typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        expect(requestUrl).toContain("https://public-api.granola.ai/v1/notes");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer grn_test_123");
        return new Response(
          JSON.stringify({
            cursor: null,
            hasMore: false,
            notes: [
              {
                created_at: "2024-01-01T00:00:00Z",
                id: "not_1d3tmYTlCICgjy",
                title: "API Key Meeting",
                updated_at: "2024-01-02T00:00:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      })
      .mockImplementationOnce(async (_url, init) => {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer grn_test_123");
        return new Response(
          JSON.stringify({
            created_at: "2024-01-01T00:00:00Z",
            folder_membership: [
              {
                id: "fol_12345678901234",
                name: "Product",
              },
            ],
            id: "not_1d3tmYTlCICgjy",
            summary_markdown: "## API Key Meeting",
            summary_text: "API Key Meeting",
            title: "API Key Meeting",
            transcript: [
              {
                end_time: "2024-01-01T00:01:00Z",
                speaker: {
                  source: "microphone",
                },
                start_time: "2024-01-01T00:00:00Z",
                text: "Hello from the public API",
              },
            ],
            updated_at: "2024-01-02T00:00:00Z",
          }),
          { status: 200 },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const runtime = await createDefaultGranolaRuntime(createConfig(undefined, "grn_test_123"), {
      warn: vi.fn(),
    });

    expect(runtime.auth).toEqual(
      expect.objectContaining({
        apiKeyAvailable: true,
        mode: "api-key",
      }),
    );

    const documents = await runtime.client.listDocuments({
      limit: 10,
      timeoutMs: 5_000,
    });

    expect(documents).toEqual([
      expect.objectContaining({
        content: "## API Key Meeting",
        folderMemberships: [expect.objectContaining({ id: "fol_12345678901234", name: "Product" })],
        id: "not_1d3tmYTlCICgjy",
        title: "API Key Meeting",
        transcriptSegments: [expect.objectContaining({ text: "Hello from the public API" })],
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("throws a helpful error when neither a stored session nor supabase.json is available", async () => {
    stubNoApiKeyStore();
    vi.spyOn(authModule, "createDefaultSessionStore").mockReturnValue(new MemorySessionStore());

    await expect(createDefaultGranolaRuntime(createConfig(), { warn: vi.fn() })).rejects.toThrow(
      "Granola credentials not found. Set --api-key or GRANOLA_API_KEY",
    );
  });
});

describe("loadOptionalGranolaCache", () => {
  test("returns undefined for a missing cache file", async () => {
    await expect(
      loadOptionalGranolaCache("/tmp/does-not-exist-cache.json"),
    ).resolves.toBeUndefined();
  });

  test("parses a cache file when one is present", async () => {
    const cachePath = await writeTempFile(
      "granola-cache",
      JSON.stringify({
        cache: JSON.stringify({
          state: {
            documents: {
              "doc-cache-1": {
                created_at: "2024-01-01T00:00:00Z",
                title: "Cached meeting",
                updated_at: "2024-01-02T00:00:00Z",
              },
            },
            transcripts: {
              "doc-cache-1": [
                {
                  document_id: "doc-cache-1",
                  end_timestamp: "2024-01-01T10:00:05Z",
                  id: "segment-cache-1",
                  is_final: true,
                  source: "microphone",
                  start_timestamp: "2024-01-01T10:00:00Z",
                  text: "Hello from cache",
                },
              ],
            },
          },
        }),
      }),
    );

    await expect(loadOptionalGranolaCache(cachePath)).resolves.toEqual(
      expect.objectContaining({
        documents: {
          "doc-cache-1": expect.objectContaining({
            title: "Cached meeting",
          }),
        },
        transcripts: {
          "doc-cache-1": [
            expect.objectContaining({
              text: "Hello from cache",
            }),
          ],
        },
      }),
    );
  });
});
