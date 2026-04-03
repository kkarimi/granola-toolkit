import { readFile } from "node:fs/promises";

import { asRecord, parseJsonString, stringValue } from "../utils.ts";

export interface AccessTokenSource {
  loadAccessToken(): Promise<string>;
}

export interface TokenStore {
  clearToken(): Promise<void>;
  readToken(): Promise<string | undefined>;
  writeToken(token: string): Promise<void>;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  invalidate(): Promise<void>;
}

export function getAccessTokenFromSupabaseContents(supabaseContents: string): string {
  const wrapper = parseJsonString<Record<string, unknown>>(supabaseContents);
  if (!wrapper) {
    throw new Error("failed to parse supabase.json");
  }

  const workosTokens = wrapper.workos_tokens;
  let tokenPayload: Record<string, unknown> | undefined;

  if (typeof workosTokens === "string") {
    tokenPayload = parseJsonString<Record<string, unknown>>(workosTokens);
  } else {
    tokenPayload = asRecord(workosTokens);
  }

  const accessToken = tokenPayload ? stringValue(tokenPayload.access_token) : "";
  if (!accessToken.trim()) {
    throw new Error("access token not found in supabase.json");
  }

  return accessToken;
}

export class SupabaseContentsTokenSource implements AccessTokenSource {
  constructor(private readonly supabaseContents: string) {}

  async loadAccessToken(): Promise<string> {
    return getAccessTokenFromSupabaseContents(this.supabaseContents);
  }
}

export class SupabaseFileTokenSource implements AccessTokenSource {
  constructor(private readonly filePath: string) {}

  async loadAccessToken(): Promise<string> {
    const supabaseContents = await readFile(this.filePath, "utf8");
    return getAccessTokenFromSupabaseContents(supabaseContents);
  }
}

export class MemoryTokenStore implements TokenStore {
  #token?: string;

  async clearToken(): Promise<void> {
    this.#token = undefined;
  }

  async readToken(): Promise<string | undefined> {
    return this.#token;
  }

  async writeToken(token: string): Promise<void> {
    this.#token = token;
  }
}

export class NoopTokenStore implements TokenStore {
  async clearToken(): Promise<void> {}

  async readToken(): Promise<string | undefined> {
    return undefined;
  }

  async writeToken(_token: string): Promise<void> {}
}

export class CachedTokenProvider implements AccessTokenProvider {
  #token?: string;

  constructor(
    private readonly source: AccessTokenSource,
    private readonly store: TokenStore = new NoopTokenStore(),
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.#token) {
      return this.#token;
    }

    const storedToken = await this.store.readToken();
    if (storedToken?.trim()) {
      this.#token = storedToken;
      return storedToken;
    }

    const token = await this.source.loadAccessToken();
    this.#token = token;
    await this.store.writeToken(token);
    return token;
  }

  async invalidate(): Promise<void> {
    this.#token = undefined;
    await this.store.clearToken();
  }
}
