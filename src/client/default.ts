import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { parseCacheContents } from "../cache.ts";
import type { AppConfig, CacheData } from "../types.ts";
import { granolaSupabaseCandidates } from "../utils.ts";

import {
  CachedTokenProvider,
  createDefaultSessionStore,
  NoopTokenStore,
  StoredSessionTokenProvider,
  SupabaseFileSessionSource,
  SupabaseFileTokenSource,
} from "./auth.ts";
import { GranolaApiClient } from "./granola.ts";
import { AuthenticatedHttpClient } from "./http.ts";

export async function createDefaultGranolaApiClient(
  config: AppConfig,
  logger: Pick<Console, "warn"> = console,
): Promise<GranolaApiClient> {
  const sessionStore = createDefaultSessionStore();
  const storedSession = await sessionStore.readSession();

  if (!storedSession && !config.supabase) {
    throw new Error(
      `supabase.json not found. Pass --supabase or create .granola.toml. Expected locations include: ${granolaSupabaseCandidates().join(", ")}`,
    );
  }

  if (!storedSession && config.supabase && !existsSync(config.supabase)) {
    throw new Error(`supabase.json not found: ${config.supabase}`);
  }

  const tokenProvider = storedSession
    ? new StoredSessionTokenProvider(sessionStore, {
        source:
          config.supabase && existsSync(config.supabase)
            ? new SupabaseFileSessionSource(config.supabase)
            : undefined,
      })
    : new CachedTokenProvider(new SupabaseFileTokenSource(config.supabase!), new NoopTokenStore());

  return new GranolaApiClient(
    new AuthenticatedHttpClient({
      logger,
      tokenProvider,
    }),
  );
}

export async function loadOptionalGranolaCache(cacheFile?: string): Promise<CacheData | undefined> {
  if (!cacheFile || !existsSync(cacheFile)) {
    return undefined;
  }

  return parseCacheContents(await readFile(cacheFile, "utf8"));
}
