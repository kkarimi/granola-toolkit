import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";

import {
  CachedTokenProvider,
  getSessionFromSupabaseContents,
  MemorySessionStore,
  MemoryTokenStore,
  StoredSessionTokenProvider,
  type AccessTokenSource,
} from "../src/client/auth.ts";

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
});
