import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import type { GranolaSessionMetadata } from "../app/models.ts";
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

export type DefaultGranolaAuthInfo = GranolaSessionMetadata;

export interface DefaultGranolaRuntime {
  auth: DefaultGranolaAuthInfo;
  client: GranolaApiClient;
}

export async function inspectDefaultGranolaAuth(
  config: AppConfig,
): Promise<DefaultGranolaAuthInfo> {
  const sessionStore = createDefaultSessionStore();
  const storedSession = await sessionStore.readSession();
  const hasStoredSession = Boolean(storedSession?.accessToken.trim());

  return {
    mode: hasStoredSession ? "stored-session" : "supabase-file",
    storedSessionAvailable: hasStoredSession,
    supabasePath: config.supabase || undefined,
  };
}

export async function createDefaultGranolaRuntime(
  config: AppConfig,
  logger: Pick<Console, "warn"> = console,
): Promise<DefaultGranolaRuntime> {
  const sessionStore = createDefaultSessionStore();
  const auth = await inspectDefaultGranolaAuth(config);
  const hasStoredSession = auth.storedSessionAvailable;

  if (!hasStoredSession && !config.supabase) {
    throw new Error(
      `supabase.json not found. Pass --supabase or create .granola.toml. Expected locations include: ${granolaSupabaseCandidates().join(", ")}`,
    );
  }

  if (!hasStoredSession && config.supabase && !existsSync(config.supabase)) {
    throw new Error(`supabase.json not found: ${config.supabase}`);
  }

  const tokenProvider = hasStoredSession
    ? new StoredSessionTokenProvider(sessionStore, {
        source:
          config.supabase && existsSync(config.supabase)
            ? new SupabaseFileSessionSource(config.supabase)
            : undefined,
      })
    : new CachedTokenProvider(new SupabaseFileTokenSource(config.supabase!), new NoopTokenStore());

  return {
    auth,
    client: new GranolaApiClient(
      new AuthenticatedHttpClient({
        logger,
        tokenProvider,
      }),
    ),
  };
}

export async function createDefaultGranolaApiClient(
  config: AppConfig,
  logger: Pick<Console, "warn"> = console,
): Promise<GranolaApiClient> {
  return (await createDefaultGranolaRuntime(config, logger)).client;
}

export async function loadOptionalGranolaCache(cacheFile?: string): Promise<CacheData | undefined> {
  if (!cacheFile || !existsSync(cacheFile)) {
    return undefined;
  }

  return parseCacheContents(await readFile(cacheFile, "utf8"));
}
