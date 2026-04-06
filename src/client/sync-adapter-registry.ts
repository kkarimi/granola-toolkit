import { existsSync } from "node:fs";

import { GranolaApiClient } from "./granola.ts";
import { GranolaPublicApiClient } from "./granola-public.ts";
import { AuthenticatedHttpClient } from "./http.ts";
import {
  CachedTokenProvider,
  createDefaultApiKeyStore,
  createDefaultSessionStore,
  NoopTokenStore,
  StoredSessionTokenProvider,
  SupabaseFileSessionSource,
  SupabaseFileTokenSource,
} from "./auth.ts";
import { inspectDefaultGranolaAuth, type DefaultGranolaAuthInfo } from "./default-auth.ts";
import { GranolaCapabilityRegistry } from "../registry.ts";
import type { AppConfig } from "../types.ts";
import { granolaSupabaseCandidates } from "../utils.ts";

export type DefaultGranolaClient = Pick<GranolaApiClient, "listDocuments"> &
  Partial<Pick<GranolaApiClient, "getDocumentTranscript" | "listFolders">>;

export interface DefaultGranolaRuntime {
  auth: DefaultGranolaAuthInfo;
  client: DefaultGranolaClient;
}

export type GranolaSyncAdapterKind = "granola";

export interface GranolaSyncAdapterDefinition {
  createRuntime(options?: {
    preferredMode?: DefaultGranolaAuthInfo["mode"];
  }): Promise<DefaultGranolaRuntime>;
  kind: GranolaSyncAdapterKind;
}

export type GranolaSyncAdapterRegistry = GranolaCapabilityRegistry<
  GranolaSyncAdapterKind,
  GranolaSyncAdapterDefinition
>;

export function createGranolaSyncAdapterRegistry(): GranolaSyncAdapterRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaSyncAdapterRegistry(
  config: AppConfig,
  logger: Pick<Console, "warn"> = console,
): GranolaSyncAdapterRegistry {
  return createGranolaSyncAdapterRegistry().register("granola", {
    kind: "granola",
    async createRuntime(options = {}) {
      const auth = await inspectDefaultGranolaAuth(config, {
        preferredMode: options.preferredMode,
      });

      if (!auth.apiKeyAvailable && !auth.storedSessionAvailable && !config.supabase) {
        throw new Error(
          `Granola credentials not found. Set --api-key or GRANOLA_API_KEY, use granola auth login --api-key, or fall back to --supabase. Expected supabase locations include: ${granolaSupabaseCandidates().join(", ")}`,
        );
      }

      if (
        config.supabase &&
        !existsSync(config.supabase) &&
        !auth.apiKeyAvailable &&
        !auth.storedSessionAvailable
      ) {
        throw new Error(`supabase.json not found: ${config.supabase}`);
      }

      if (
        auth.mode !== "api-key" &&
        !auth.storedSessionAvailable &&
        config.supabase &&
        !existsSync(config.supabase)
      ) {
        throw new Error(`supabase.json not found: ${config.supabase}`);
      }

      if (auth.mode === "api-key") {
        const apiKeyStore = createDefaultApiKeyStore();
        const apiKey = config.apiKey?.trim() || (await apiKeyStore.readApiKey());
        if (!apiKey) {
          throw new Error(
            "Granola API key not found. Set --api-key or GRANOLA_API_KEY, or run granola auth login --api-key <token>.",
          );
        }

        return {
          auth,
          client: new GranolaPublicApiClient(
            new AuthenticatedHttpClient({
              logger,
              tokenProvider: new CachedTokenProvider({
                async loadAccessToken() {
                  return apiKey;
                },
              }),
            }),
          ),
        };
      }

      const sessionStore = createDefaultSessionStore();
      const tokenProvider =
        auth.mode === "stored-session"
          ? new StoredSessionTokenProvider(sessionStore, {
              source:
                config.supabase && existsSync(config.supabase)
                  ? new SupabaseFileSessionSource(config.supabase)
                  : undefined,
            })
          : new CachedTokenProvider(
              new SupabaseFileTokenSource(config.supabase!),
              new NoopTokenStore(),
            );

      return {
        auth,
        client: new GranolaApiClient(
          new AuthenticatedHttpClient({
            logger,
            tokenProvider,
          }),
        ),
      };
    },
  });
}
