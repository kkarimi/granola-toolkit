import { describe, expect, test } from "vite-plus/test";

import {
  CachedTokenProvider,
  MemoryTokenStore,
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
});
