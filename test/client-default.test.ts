import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { MemorySessionStore } from "../src/client/auth.ts";
import { createDefaultGranolaRuntime, loadOptionalGranolaCache } from "../src/client/default.ts";
import * as authModule from "../src/client/auth.ts";
import type { AppConfig } from "../src/types.ts";

function createConfig(supabasePath?: string): AppConfig {
  return {
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createDefaultGranolaRuntime", () => {
  test("uses the supabase file token source when supabase mode is preferred", async () => {
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

  test("throws a helpful error when neither a stored session nor supabase.json is available", async () => {
    vi.spyOn(authModule, "createDefaultSessionStore").mockReturnValue(new MemorySessionStore());

    await expect(createDefaultGranolaRuntime(createConfig(), { warn: vi.fn() })).rejects.toThrow(
      "supabase.json not found. Pass --supabase or create .granola.toml.",
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
