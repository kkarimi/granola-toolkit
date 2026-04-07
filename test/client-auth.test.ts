import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  CachedTokenProvider,
  getSessionFromSupabaseContents,
  MemoryApiKeyStore,
  MemorySessionStore,
  MemoryTokenStore,
  SupabaseContentsSessionSource,
  StoredSessionTokenProvider,
  type AccessTokenSource,
} from "../src/client/auth.ts";
import { createDefaultGranolaAuthController } from "../src/client/default-auth.ts";

describe("CachedTokenProvider", () => {
  test("caches the token until invalidated", async () => {
    let currentToken = "token-1";
    let reads = 0;

    const source: AccessTokenSource = {
      async loadAccessToken() {
        reads += 1;
        return currentToken;
      },
    };

    const provider = new CachedTokenProvider(source, new MemoryTokenStore());

    expect(await provider.getAccessToken()).toBe("token-1");
    currentToken = "token-2";
    expect(await provider.getAccessToken()).toBe("token-1");
    expect(reads).toBe(1);

    await provider.invalidate();

    expect(await provider.getAccessToken()).toBe("token-2");
    expect(reads).toBe(2);
  });

  test("parses a stored session from a real supabase fixture", async () => {
    const contents = await readFile(
      new URL("./fixtures/granola-supabase.fixture.json", import.meta.url),
      "utf8",
    );
    const session = getSessionFromSupabaseContents(contents);

    expect(session.accessToken).toBe("fixture-workos-access-token");
    expect(session.refreshToken).toBe("fixture-workos-refresh-token");
    expect(session.clientId).toBe("client_GranolaMac");
    expect(session.signInMethod).toBe("google-oauth");
  });

  test("refreshes a stored session after invalidation", async () => {
    const store = new MemorySessionStore();
    await store.writeSession({
      accessToken: "token-1",
      clientId: "client_GranolaMac",
      refreshToken: "refresh-1",
    });

    const provider = new StoredSessionTokenProvider(store, {
      fetchImpl: async (_url, init) => {
        if (typeof init?.body !== "string") {
          throw new Error("expected request body to be a string");
        }

        const body = JSON.parse(init.body) as {
          client_id: string;
          grant_type: string;
          refresh_token: string;
        };

        expect(body).toEqual({
          client_id: "client_GranolaMac",
          grant_type: "refresh_token",
          refresh_token: "refresh-1",
        });

        return new Response(
          JSON.stringify({
            access_token: "token-2",
            refresh_token: "refresh-2",
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      },
    });

    expect(await provider.getAccessToken()).toBe("token-1");
    await provider.invalidate();
    expect(await provider.getAccessToken()).toBe("token-2");

    expect(await store.readSession()).toEqual(
      expect.objectContaining({
        accessToken: "token-2",
        refreshToken: "refresh-2",
      }),
    );
  });

  test("falls back to the source session when refresh fails", async () => {
    const store = new MemorySessionStore();
    await store.writeSession({
      accessToken: "token-1",
      clientId: "client_GranolaMac",
      refreshToken: "refresh-1",
    });

    const provider = new StoredSessionTokenProvider(store, {
      fetchImpl: async () =>
        new Response("bad refresh", { status: 400, statusText: "Bad Request" }),
      source: new SupabaseContentsSessionSource(
        JSON.stringify({
          workos_tokens: JSON.stringify({
            access_token: "token-from-source",
            client_id: "client_GranolaMac",
            refresh_token: "refresh-from-source",
          }),
        }),
      ),
    });

    await provider.invalidate();

    expect(await provider.getAccessToken()).toBe("token-from-source");
    expect(await store.readSession()).toEqual(
      expect.objectContaining({
        accessToken: "token-from-source",
        refreshToken: "refresh-from-source",
      }),
    );
  });

  test("switches between stored and supabase auth modes", async () => {
    const fixture = await readFile(
      new URL("./fixtures/granola-supabase.fixture.json", import.meta.url),
      "utf8",
    );
    const supabasePath = join(tmpdir(), `granola-auth-${Date.now()}.json`);
    await writeFile(supabasePath, fixture, "utf8");

    const controller = createDefaultGranolaAuthController(
      {
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
      },
      {
        apiKeyStore: new MemoryApiKeyStore(),
        sessionStore: new MemorySessionStore(),
      },
    );

    const initial = await controller.inspect();
    const loggedIn = await controller.login();
    const switched = await controller.switchMode("supabase-file");

    expect(initial).toEqual(
      expect.objectContaining({
        mode: "supabase-file",
        storedSessionAvailable: false,
        supabaseAvailable: true,
      }),
    );
    expect(loggedIn).toEqual(
      expect.objectContaining({
        clientId: "client_GranolaMac",
        mode: "stored-session",
        refreshAvailable: true,
        storedSessionAvailable: true,
      }),
    );
    expect(switched.mode).toBe("supabase-file");
  });

  test("records refresh failures in auth state", async () => {
    const store = new MemorySessionStore();
    await store.writeSession({
      accessToken: "token-1",
      clientId: "client_GranolaMac",
      refreshToken: "refresh-1",
    });

    const controller = createDefaultGranolaAuthController(
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
        apiKeyStore: new MemoryApiKeyStore(),
        fetchImpl: async () =>
          new Response("bad refresh", { status: 400, statusText: "Bad Request" }),
        sessionStore: store,
      },
    );

    await expect(controller.refresh()).rejects.toThrow(
      "failed to refresh session: 400 Bad Request",
    );
    await expect(controller.inspect()).resolves.toEqual(
      expect.objectContaining({
        lastError: "failed to refresh session: 400 Bad Request",
        mode: "stored-session",
        storedSessionAvailable: true,
      }),
    );
  });

  test("stores and prefers a Granola API key", async () => {
    const apiKeyStore = new MemoryApiKeyStore();
    const controller = createDefaultGranolaAuthController(
      {
        debug: false,
        notes: {
          output: "/tmp/notes",
          timeoutMs: 120_000,
        },
        transcripts: {
          cacheFile: "",
          output: "/tmp/transcripts",
        },
      },
      {
        apiKeyStore,
        sessionStore: new MemorySessionStore(),
      },
    );

    const loggedIn = await controller.login({
      apiKey: "grn_test_123",
    });

    expect(loggedIn).toEqual(
      expect.objectContaining({
        apiKeyAvailable: true,
        mode: "api-key",
        storedSessionAvailable: false,
        supabaseAvailable: false,
      }),
    );
    await expect(apiKeyStore.readApiKey()).resolves.toBe("grn_test_123");

    const cleared = await controller.clearApiKey();
    expect(cleared).toEqual(
      expect.objectContaining({
        apiKeyAvailable: false,
        mode: "api-key",
      }),
    );
    await expect(apiKeyStore.readApiKey()).resolves.toBeUndefined();

    const loggedOut = await controller.logout();
    expect(loggedOut).toEqual(
      expect.objectContaining({
        apiKeyAvailable: false,
        mode: "api-key",
      }),
    );
  });
});
