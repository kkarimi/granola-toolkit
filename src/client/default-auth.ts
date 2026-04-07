import { existsSync } from "node:fs";

import type { GranolaSessionMetadata, GranolaSessionMode } from "../app/models.ts";
import type { AppConfig } from "../types.ts";
import { granolaSupabaseCandidates } from "../utils.ts";

import {
  createDefaultApiKeyStore,
  createDefaultSessionStore,
  refreshGranolaSession,
  SupabaseFileSessionSource,
  type ApiKeyStore,
  type GranolaSession,
  type SessionSource,
  type SessionStore,
} from "./auth.ts";

export type DefaultGranolaAuthInfo = GranolaSessionMetadata;

export interface DefaultGranolaAuthController {
  clearApiKey(): Promise<DefaultGranolaAuthInfo>;
  inspect(): Promise<DefaultGranolaAuthInfo>;
  login(options?: { apiKey?: string; supabasePath?: string }): Promise<DefaultGranolaAuthInfo>;
  logout(): Promise<DefaultGranolaAuthInfo>;
  refresh(): Promise<DefaultGranolaAuthInfo>;
  switchMode(mode: GranolaSessionMode): Promise<DefaultGranolaAuthInfo>;
}

interface DefaultGranolaAuthStateOptions {
  apiKey?: string;
  existsSyncImpl?: typeof existsSync;
  lastError?: string;
  preferredMode?: GranolaSessionMode;
  session?: GranolaSession;
}

export interface CreateDefaultGranolaAuthControllerOptions {
  apiKeyStore?: ApiKeyStore;
  existsSyncImpl?: typeof existsSync;
  fetchImpl?: typeof fetch;
  sessionSourceFactory?: (supabasePath: string) => SessionSource;
  sessionStore?: SessionStore;
}

function hasStoredSession(session: GranolaSession | undefined): session is GranolaSession {
  return Boolean(session?.accessToken.trim());
}

function resolveActiveMode(options: {
  apiKeyAvailable: boolean;
  preferredMode?: GranolaSessionMode;
  storedSessionAvailable: boolean;
  supabaseAvailable: boolean;
}): GranolaSessionMode {
  if (options.preferredMode === "api-key" && options.apiKeyAvailable) {
    return "api-key";
  }

  if (options.preferredMode === "stored-session" && options.storedSessionAvailable) {
    return "stored-session";
  }

  if (options.preferredMode === "supabase-file" && options.supabaseAvailable) {
    return "supabase-file";
  }

  if (options.apiKeyAvailable) {
    return "api-key";
  }

  if (options.storedSessionAvailable) {
    return "stored-session";
  }

  if (options.supabaseAvailable) {
    return "supabase-file";
  }

  return options.preferredMode ?? "api-key";
}

function missingSupabaseError(): Error {
  return new Error(
    `supabase.json not found. Pass --supabase or create .granola.toml. Expected locations include: ${granolaSupabaseCandidates().join(", ")}`,
  );
}

function buildDefaultGranolaAuthInfo(
  config: AppConfig,
  options: DefaultGranolaAuthStateOptions = {},
): DefaultGranolaAuthInfo {
  const existsSyncImpl = options.existsSyncImpl ?? existsSync;
  const apiKeyAvailable = Boolean(options.apiKey?.trim());
  const session = options.session;
  const storedSessionAvailable = hasStoredSession(session);
  const supabasePath = config.supabase || undefined;
  const supabaseAvailable = Boolean(supabasePath && existsSyncImpl(supabasePath));

  return {
    apiKeyAvailable,
    clientId: session?.clientId,
    lastError: options.lastError,
    mode: resolveActiveMode({
      apiKeyAvailable,
      preferredMode: options.preferredMode,
      storedSessionAvailable,
      supabaseAvailable,
    }),
    refreshAvailable: Boolean(session?.refreshToken?.trim()),
    signInMethod: session?.signInMethod,
    storedSessionAvailable,
    supabaseAvailable,
    supabasePath,
  };
}

export async function inspectDefaultGranolaAuth(
  config: AppConfig,
  options: DefaultGranolaAuthStateOptions & {
    apiKeyStore?: ApiKeyStore;
    sessionStore?: SessionStore;
  } = {},
): Promise<DefaultGranolaAuthInfo> {
  const apiKeyStore = options.apiKeyStore ?? createDefaultApiKeyStore();
  const sessionStore = options.sessionStore ?? createDefaultSessionStore();
  const apiKey = options.apiKey ?? config.apiKey ?? (await apiKeyStore.readApiKey());
  const session = options.session ?? (await sessionStore.readSession());
  return buildDefaultGranolaAuthInfo(config, {
    apiKey,
    existsSyncImpl: options.existsSyncImpl,
    lastError: options.lastError,
    preferredMode: options.preferredMode,
    session,
  });
}

class DefaultAuthController implements DefaultGranolaAuthController {
  #lastError?: string;
  #preferredMode?: GranolaSessionMode;

  constructor(
    private readonly config: AppConfig,
    private readonly options: CreateDefaultGranolaAuthControllerOptions = {},
  ) {}

  private sessionStore(): SessionStore {
    return this.options.sessionStore ?? createDefaultSessionStore();
  }

  private apiKeyStore(): ApiKeyStore {
    return this.options.apiKeyStore ?? createDefaultApiKeyStore();
  }

  private async readApiKey(): Promise<string | undefined> {
    return this.config.apiKey?.trim() || (await this.apiKeyStore().readApiKey());
  }

  private readSession(): Promise<GranolaSession | undefined> {
    return this.sessionStore().readSession();
  }

  private resolveSupabasePath(overridePath?: string): string {
    const supabasePath = overridePath?.trim() || this.config.supabase || "";
    if (!supabasePath) {
      throw missingSupabaseError();
    }

    const existsSyncImpl = this.options.existsSyncImpl ?? existsSync;
    if (!existsSyncImpl(supabasePath)) {
      throw new Error(`supabase.json not found: ${supabasePath}`);
    }

    return supabasePath;
  }

  private sessionSource(supabasePath: string): SessionSource {
    return (
      this.options.sessionSourceFactory?.(supabasePath) ??
      new SupabaseFileSessionSource(supabasePath)
    );
  }

  async inspect(): Promise<DefaultGranolaAuthInfo> {
    const apiKey = await this.readApiKey();
    const session = await this.readSession();
    return buildDefaultGranolaAuthInfo(this.config, {
      apiKey,
      existsSyncImpl: this.options.existsSyncImpl,
      lastError: this.#lastError,
      preferredMode: this.#preferredMode,
      session,
    });
  }

  async login(
    options: { apiKey?: string; supabasePath?: string } = {},
  ): Promise<DefaultGranolaAuthInfo> {
    const apiKey = options.apiKey?.trim();
    if (apiKey) {
      await this.apiKeyStore().writeApiKey(apiKey);
      this.#lastError = undefined;
      this.#preferredMode = "api-key";
      return await this.inspect();
    }

    const supabasePath = this.resolveSupabasePath(options.supabasePath);
    const session = await this.sessionSource(supabasePath).loadSession();
    await this.sessionStore().writeSession(session);
    this.#lastError = undefined;
    this.#preferredMode = "stored-session";
    return await this.inspect();
  }

  async clearApiKey(): Promise<DefaultGranolaAuthInfo> {
    await this.apiKeyStore().clearApiKey();
    this.#lastError = undefined;
    if (this.#preferredMode === "api-key") {
      this.#preferredMode = undefined;
    }
    return await this.inspect();
  }

  async logout(): Promise<DefaultGranolaAuthInfo> {
    await this.apiKeyStore().clearApiKey();
    await this.sessionStore().clearSession();
    this.#lastError = undefined;
    this.#preferredMode = undefined;
    return await this.inspect();
  }

  async refresh(): Promise<DefaultGranolaAuthInfo> {
    const session = await this.readSession();
    if (!hasStoredSession(session)) {
      this.#lastError = "no stored Granola session found";
      throw new Error(this.#lastError);
    }

    try {
      const refreshed = await refreshGranolaSession(session, this.options.fetchImpl);
      await this.sessionStore().writeSession(refreshed);
      this.#lastError = undefined;
      this.#preferredMode = "stored-session";
      return await this.inspect();
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async switchMode(mode: GranolaSessionMode): Promise<DefaultGranolaAuthInfo> {
    const state = await this.inspect();
    if (mode === "api-key" && !state.apiKeyAvailable) {
      this.#lastError = "no Granola API key found";
      throw new Error(this.#lastError);
    }

    if (mode === "stored-session" && !state.storedSessionAvailable) {
      this.#lastError = "no stored Granola session found";
      throw new Error(this.#lastError);
    }

    if (mode === "supabase-file") {
      this.resolveSupabasePath();
    }

    this.#lastError = undefined;
    this.#preferredMode = mode;
    return await this.inspect();
  }
}

export function createDefaultGranolaAuthController(
  config: AppConfig,
  options: CreateDefaultGranolaAuthControllerOptions = {},
): DefaultGranolaAuthController {
  return new DefaultAuthController(config, options);
}
