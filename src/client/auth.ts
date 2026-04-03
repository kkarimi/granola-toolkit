import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { asRecord, parseJsonString, stringValue } from "../utils.ts";

const execFileAsync = promisify(execFile);
const DEFAULT_CLIENT_ID = "client_GranolaMac";
const KEYCHAIN_SERVICE_NAME = "com.granola.toolkit";
const KEYCHAIN_ACCOUNT_NAME = "session";
const WORKOS_AUTH_URL = "https://api.workos.com/user_management/authenticate";

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export interface GranolaSession {
  accessToken: string;
  clientId: string;
  expiresIn?: number;
  externalId?: string;
  obtainedAt?: string;
  refreshToken?: string;
  sessionId?: string;
  signInMethod?: string;
  tokenType?: string;
}

export interface AccessTokenSource {
  loadAccessToken(): Promise<string>;
}

export interface SessionSource {
  loadSession(): Promise<GranolaSession>;
}

export interface TokenStore {
  clearToken(): Promise<void>;
  readToken(): Promise<string | undefined>;
  writeToken(token: string): Promise<void>;
}

export interface SessionStore {
  clearSession(): Promise<void>;
  readSession(): Promise<GranolaSession | undefined>;
  writeSession(session: GranolaSession): Promise<void>;
}

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
  invalidate(): Promise<void>;
}

function parseSessionRecord(record: Record<string, unknown>): GranolaSession | undefined {
  const accessToken = stringValue(record.access_token);
  if (!accessToken.trim()) {
    return undefined;
  }

  return {
    accessToken,
    clientId: stringValue(record.client_id) || DEFAULT_CLIENT_ID,
    expiresIn: numberValue(record.expires_in),
    externalId: stringValue(record.external_id) || undefined,
    obtainedAt: stringValue(record.obtained_at) || undefined,
    refreshToken: stringValue(record.refresh_token) || undefined,
    sessionId: stringValue(record.session_id) || undefined,
    signInMethod: stringValue(record.sign_in_method) || undefined,
    tokenType: stringValue(record.token_type) || undefined,
  };
}

function parseNestedRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    return parseJsonString<Record<string, unknown>>(value);
  }

  return asRecord(value);
}

export function getSessionFromSupabaseContents(supabaseContents: string): GranolaSession {
  const wrapper = parseJsonString<Record<string, unknown>>(supabaseContents);
  if (!wrapper) {
    throw new Error("failed to parse supabase.json");
  }

  const workOsSession = parseSessionRecord(parseNestedRecord(wrapper.workos_tokens) ?? {});
  if (workOsSession) {
    return workOsSession;
  }

  const cognitoSession = parseSessionRecord(parseNestedRecord(wrapper.cognito_tokens) ?? {});
  if (cognitoSession) {
    return cognitoSession;
  }

  const legacySession = parseSessionRecord(wrapper);
  if (legacySession) {
    return legacySession;
  }

  throw new Error("access token not found in supabase.json");
}

export function getAccessTokenFromSupabaseContents(supabaseContents: string): string {
  return getSessionFromSupabaseContents(supabaseContents).accessToken;
}

export class SupabaseContentsTokenSource implements AccessTokenSource {
  constructor(private readonly supabaseContents: string) {}

  async loadAccessToken(): Promise<string> {
    return getAccessTokenFromSupabaseContents(this.supabaseContents);
  }
}

export class SupabaseContentsSessionSource implements SessionSource {
  constructor(private readonly supabaseContents: string) {}

  async loadSession(): Promise<GranolaSession> {
    return getSessionFromSupabaseContents(this.supabaseContents);
  }
}

export class SupabaseFileTokenSource implements AccessTokenSource {
  constructor(private readonly filePath: string) {}

  async loadAccessToken(): Promise<string> {
    const supabaseContents = await readFile(this.filePath, "utf8");
    return getAccessTokenFromSupabaseContents(supabaseContents);
  }
}

export class SupabaseFileSessionSource implements SessionSource {
  constructor(private readonly filePath: string) {}

  async loadSession(): Promise<GranolaSession> {
    const supabaseContents = await readFile(this.filePath, "utf8");
    return getSessionFromSupabaseContents(supabaseContents);
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

export class MemorySessionStore implements SessionStore {
  #session?: GranolaSession;

  async clearSession(): Promise<void> {
    this.#session = undefined;
  }

  async readSession(): Promise<GranolaSession | undefined> {
    return this.#session;
  }

  async writeSession(session: GranolaSession): Promise<void> {
    this.#session = session;
  }
}

export class FileSessionStore implements SessionStore {
  constructor(private readonly filePath: string = defaultSessionFilePath()) {}

  async clearSession(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch {}
  }

  async readSession(): Promise<GranolaSession | undefined> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<GranolaSession>(contents);
      return parsed?.accessToken ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async writeSession(session: GranolaSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(session, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export class KeychainSessionStore implements SessionStore {
  async clearSession(): Promise<void> {
    try {
      await execFileAsync("security", [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE_NAME,
        "-a",
        KEYCHAIN_ACCOUNT_NAME,
      ]);
    } catch {}
  }

  async readSession(): Promise<GranolaSession | undefined> {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE_NAME,
        "-a",
        KEYCHAIN_ACCOUNT_NAME,
        "-w",
      ]);
      const parsed = parseJsonString<GranolaSession>(stdout.trim());
      return parsed?.accessToken ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async writeSession(session: GranolaSession): Promise<void> {
    await execFileAsync("security", [
      "add-generic-password",
      "-U",
      "-s",
      KEYCHAIN_SERVICE_NAME,
      "-a",
      KEYCHAIN_ACCOUNT_NAME,
      "-w",
      JSON.stringify(session),
    ]);
  }
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

export class StoredSessionTokenProvider implements AccessTokenProvider {
  #session?: GranolaSession;

  constructor(
    private readonly store: SessionStore,
    private readonly options: {
      fetchImpl?: typeof fetch;
      source?: SessionSource;
    } = {},
  ) {}

  private async loadSession(): Promise<GranolaSession> {
    if (this.#session) {
      return this.#session;
    }

    const storedSession = await this.store.readSession();
    if (storedSession?.accessToken.trim()) {
      this.#session = storedSession;
      return storedSession;
    }

    if (!this.options.source) {
      throw new Error("no stored Granola session found");
    }

    const sourcedSession = await this.options.source.loadSession();
    this.#session = sourcedSession;
    return sourcedSession;
  }

  async getAccessToken(): Promise<string> {
    const session = await this.loadSession();
    return session.accessToken;
  }

  async invalidate(): Promise<void> {
    const session = await this.loadSession().catch(() => undefined);
    if (session?.refreshToken && session.clientId) {
      const refreshedSession = await refreshGranolaSession(session, this.options.fetchImpl);
      this.#session = refreshedSession;
      await this.store.writeSession(refreshedSession);
      return;
    }

    if (this.options.source) {
      const sourcedSession = await this.options.source.loadSession();
      this.#session = sourcedSession;
      return;
    }

    this.#session = undefined;
    await this.store.clearSession();
  }
}

export async function refreshGranolaSession(
  session: GranolaSession,
  fetchImpl: typeof fetch = fetch,
): Promise<GranolaSession> {
  if (!session.refreshToken?.trim()) {
    throw new Error("refresh token not available");
  }

  const response = await fetchImpl(WORKOS_AUTH_URL, {
    body: JSON.stringify({
      client_id: session.clientId,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`failed to refresh session: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const refreshed = parseSessionRecord(payload);
  if (!refreshed) {
    throw new Error("failed to parse refreshed session");
  }

  return {
    ...session,
    ...refreshed,
    clientId: refreshed.clientId || session.clientId,
    obtainedAt: refreshed.obtainedAt ?? new Date().toISOString(),
    refreshToken: refreshed.refreshToken ?? session.refreshToken,
  };
}

export function defaultSessionFilePath(): string {
  const home = homedir();
  return platform() === "darwin"
    ? join(home, "Library", "Application Support", "granola-toolkit", "session.json")
    : join(home, ".config", "granola-toolkit", "session.json");
}

export function createDefaultSessionStore(): SessionStore {
  return platform() === "darwin" ? new KeychainSessionStore() : new FileSessionStore();
}
