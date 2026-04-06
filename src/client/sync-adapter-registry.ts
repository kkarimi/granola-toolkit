import { existsSync } from "node:fs";

import { GranolaApiClient } from "./granola.ts";
import { GranolaPublicApiClient } from "./granola-public.ts";
import { AuthenticatedHttpClient } from "./http.ts";
import { isGranolaRateLimitError } from "./errors.ts";
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

function resolveFallbackMode(
  auth: DefaultGranolaAuthInfo,
): DefaultGranolaAuthInfo["mode"] | undefined {
  if (auth.mode !== "api-key") {
    return undefined;
  }

  if (auth.storedSessionAvailable) {
    return "stored-session";
  }

  if (auth.supabaseAvailable) {
    return "supabase-file";
  }

  return undefined;
}

function createPrivateGranolaClient(
  auth: DefaultGranolaAuthInfo,
  config: AppConfig,
  logger: Pick<Console, "warn">,
): DefaultGranolaClient {
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

  return new GranolaApiClient(
    new AuthenticatedHttpClient({
      logger,
      tokenProvider,
    }),
  );
}

function createRateLimitedFallbackClient(options: {
  fallbackFactory: () => Promise<DefaultGranolaClient>;
  logger: Pick<Console, "warn">;
  primary: DefaultGranolaClient;
}): DefaultGranolaClient {
  let fallbackPromise: Promise<DefaultGranolaClient> | undefined;
  const fallbackClient = async () => {
    fallbackPromise ??= options.fallbackFactory();
    return await fallbackPromise;
  };

  const retryWithFallback = async <T>(
    action: string,
    fn: (client: DefaultGranolaClient) => Promise<T>,
  ): Promise<T> => {
    try {
      return await fn(options.primary);
    } catch (error) {
      if (!isGranolaRateLimitError(error)) {
        throw error;
      }

      options.logger.warn?.(
        `Granola Personal API hit rate limits during ${action}; retrying with desktop auth fallback`,
      );
      return await fn(await fallbackClient());
    }
  };

  return {
    async listDocuments(requestOptions) {
      return await retryWithFallback("document sync", async (client) => {
        return await client.listDocuments(requestOptions);
      });
    },
    async listFolders(requestOptions) {
      return await retryWithFallback("folder sync", async (client) => {
        if (typeof client.listFolders !== "function") {
          throw new Error("folder listing not available for the active Granola client");
        }

        return await client.listFolders(requestOptions);
      });
    },
    async getDocumentTranscript(documentId, requestOptions) {
      return await retryWithFallback("transcript fetch", async (client) => {
        if (typeof client.getDocumentTranscript !== "function") {
          throw new Error("transcript loading not available for the active Granola client");
        }

        return await client.getDocumentTranscript(documentId, requestOptions);
      });
    },
  };
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

        const publicClient = new GranolaPublicApiClient(
          new AuthenticatedHttpClient({
            logger,
            tokenProvider: new CachedTokenProvider({
              async loadAccessToken() {
                return apiKey;
              },
            }),
          }),
        );
        const fallbackMode = resolveFallbackMode(auth);

        return {
          auth,
          client: fallbackMode
            ? createRateLimitedFallbackClient({
                fallbackFactory: async () => {
                  const fallbackAuth = await inspectDefaultGranolaAuth(config, {
                    preferredMode: fallbackMode,
                  });
                  return createPrivateGranolaClient(fallbackAuth, config, logger);
                },
                logger,
                primary: publicClient,
              })
            : publicClient,
        };
      }

      return {
        auth,
        client: createPrivateGranolaClient(auth, config, logger),
      };
    },
  });
}
