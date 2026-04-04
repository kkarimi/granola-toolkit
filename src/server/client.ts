import type {
  FolderRecord,
  GranolaAppApi,
  GranolaAutomationActionRun,
  GranolaAutomationActionRunStatus,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppSyncEventsResult,
  GranolaAppSyncResult,
  GranolaAppSyncState,
  GranolaExportJobRunResult,
  GranolaAppState,
  GranolaAppStateEvent,
  GranolaExportJobsListOptions,
  GranolaExportJobsResult,
  GranolaExportRunOptions,
  GranolaFolderListOptions,
  GranolaFolderListResult,
  GranolaMeetingBundle,
  GranolaMeetingListOptions,
  GranolaMeetingListResult,
  GranolaNotesExportResult,
  GranolaAutomationRunsResult,
  GranolaTranscriptsExportResult,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../app/index.ts";
import {
  granolaAutomationRunDecisionPath,
  granolaAutomationRunsPath,
  granolaExportJobRerunPath,
  granolaExportJobsPath,
  granolaFolderPath,
  granolaFolderResolvePath,
  granolaFoldersPath,
  granolaMeetingPath,
  granolaMeetingResolvePath,
  granolaMeetingsPath,
  granolaTransportPaths,
  GRANOLA_TRANSPORT_PROTOCOL_VERSION,
  type GranolaServerInfo,
} from "../transport.ts";

interface GranolaServerClientOptions {
  fetchImpl?: typeof fetch;
  password?: string;
  reconnectDelayMs?: number;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normaliseServerUrl(serverUrl: string | URL): URL {
  const raw = serverUrl instanceof URL ? serverUrl.href : serverUrl.trim();
  if (!raw) {
    throw new Error("server URL is required");
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("server URL must use http or https");
  }

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function mergeHeaders(...values: Array<NonNullable<RequestInit["headers"]> | undefined>): Headers {
  const headers = new Headers();
  for (const value of values) {
    if (!value) {
      continue;
    }

    const nextHeaders = new Headers(value);
    nextHeaders.forEach((headerValue, headerName) => {
      headers.set(headerName, headerValue);
    });
  }

  return headers;
}

async function responseError(response: Response): Promise<Error> {
  let message = `${response.status} ${response.statusText}`.trim();

  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      message = payload.error;
    } else if (typeof payload.message === "string" && payload.message.trim()) {
      message = payload.message;
    }
  } catch {
    const text = (await response.text()).trim();
    if (text) {
      message = text;
    }
  }

  return new Error(message);
}

function parseSseEvent(payload: string): GranolaAppStateEvent | undefined {
  const data = payload
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (!data) {
    return undefined;
  }

  return JSON.parse(data) as GranolaAppStateEvent;
}

export class GranolaServerClient implements GranolaAppApi {
  #closed = false;
  #eventLoop?: Promise<void>;
  #listeners = new Set<(event: GranolaAppStateEvent) => void>();
  readonly #fetchImpl: typeof fetch;
  readonly #password?: string;
  readonly #reconnectDelayMs: number;
  readonly info: GranolaServerInfo;
  #streamAbortController?: AbortController;

  private constructor(
    info: GranolaServerInfo,
    readonly url: URL,
    initialState: GranolaAppState,
    options: GranolaServerClientOptions = {},
  ) {
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.info = cloneValue(info);
    this.#password = options.password?.trim() || undefined;
    this.#reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
    this.#state = cloneValue(initialState);
  }

  static async connect(
    serverUrl: string | URL,
    options: GranolaServerClientOptions = {},
  ): Promise<GranolaServerClient> {
    const url = normaliseServerUrl(serverUrl);
    const fetchImpl = options.fetchImpl ?? fetch;
    const infoResponse = await fetchImpl(new URL(granolaTransportPaths.serverInfo, url), {
      headers: mergeHeaders({
        ...(options.password?.trim() ? { "x-granola-password": options.password.trim() } : {}),
        accept: "application/json",
      }),
    });
    if (!infoResponse.ok) {
      throw await responseError(infoResponse);
    }

    const info = (await infoResponse.json()) as GranolaServerInfo;
    if (info.protocolVersion !== GRANOLA_TRANSPORT_PROTOCOL_VERSION) {
      throw new Error(
        `unsupported Granola transport protocol: expected ${GRANOLA_TRANSPORT_PROTOCOL_VERSION}, got ${info.protocolVersion}`,
      );
    }

    const response = await fetchImpl(new URL(granolaTransportPaths.state, url), {
      headers: mergeHeaders({
        ...(options.password?.trim() ? { "x-granola-password": options.password.trim() } : {}),
        accept: "application/json",
      }),
    });
    if (!response.ok) {
      throw await responseError(response);
    }

    const initialState = (await response.json()) as GranolaAppState;
    const client = new GranolaServerClient(info, url, initialState, options);
    client.startEvents();
    return client;
  }

  #state: GranolaAppState;

  async close(): Promise<void> {
    this.#closed = true;
    this.#streamAbortController?.abort();
    try {
      await this.#eventLoop;
    } catch {
      // Closing the client should be best-effort.
    }
  }

  getState(): GranolaAppState {
    return cloneValue(this.#state);
  }

  subscribe(listener: (event: GranolaAppStateEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async inspectAuth(): Promise<GranolaAppAuthState> {
    return await this.requestJson(granolaTransportPaths.authStatus);
  }

  async listAutomationRules(): Promise<import("../app/index.ts").GranolaAutomationRulesResult> {
    return await this.requestJson(granolaTransportPaths.automationRules);
  }

  async listAutomationMatches(
    options: { limit?: number } = {},
  ): Promise<import("../app/index.ts").GranolaAutomationMatchesResult> {
    const path = options.limit
      ? `${granolaTransportPaths.automationMatches}?limit=${encodeURIComponent(String(options.limit))}`
      : granolaTransportPaths.automationMatches;
    return await this.requestJson(path);
  }

  async listAutomationRuns(
    options: { limit?: number; status?: GranolaAutomationActionRunStatus } = {},
  ): Promise<GranolaAutomationRunsResult> {
    return await this.requestJson(granolaAutomationRunsPath(options));
  }

  async resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string } = {},
  ): Promise<GranolaAutomationActionRun> {
    return await this.requestJson(granolaAutomationRunDecisionPath(id, decision), {
      body: JSON.stringify(options),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async inspectSync(): Promise<GranolaAppSyncState> {
    return cloneValue(this.#state.sync);
  }

  async listSyncEvents(options: { limit?: number } = {}): Promise<GranolaAppSyncEventsResult> {
    const path = options.limit
      ? `${granolaTransportPaths.syncEvents}?limit=${encodeURIComponent(String(options.limit))}`
      : granolaTransportPaths.syncEvents;
    return await this.requestJson(path);
  }

  async loginAuth(
    options: { apiKey?: string; supabasePath?: string } = {},
  ): Promise<GranolaAppAuthState> {
    return await this.requestJson(granolaTransportPaths.authLogin, {
      body: JSON.stringify(options),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async logoutAuth(): Promise<GranolaAppAuthState> {
    return await this.requestJson(granolaTransportPaths.authLogout, {
      method: "POST",
    });
  }

  async refreshAuth(): Promise<GranolaAppAuthState> {
    return await this.requestJson(granolaTransportPaths.authRefresh, {
      method: "POST",
    });
  }

  async switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState> {
    return await this.requestJson(granolaTransportPaths.authMode, {
      body: JSON.stringify({ mode }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async sync(
    options: { forceRefresh?: boolean; foreground?: boolean } = {},
  ): Promise<GranolaAppSyncResult> {
    return await this.requestJson(granolaTransportPaths.syncRun, {
      body: JSON.stringify(options),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async listFolders(options: GranolaFolderListOptions = {}): Promise<GranolaFolderListResult> {
    return await this.requestJson(granolaFoldersPath(options));
  }

  async getFolder(id: string): Promise<FolderRecord> {
    return await this.requestJson(granolaFolderPath(id));
  }

  async findFolder(query: string): Promise<FolderRecord> {
    return await this.requestJson(granolaFolderResolvePath(query));
  }

  async listMeetings(options: GranolaMeetingListOptions = {}): Promise<GranolaMeetingListResult> {
    return await this.requestJson(granolaMeetingsPath(options));
  }

  async getMeeting(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    return await this.requestJson(
      `${granolaMeetingPath(id)}${options.requireCache ? "?includeTranscript=true" : ""}`,
    );
  }

  async findMeeting(
    query: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    return await this.requestJson(
      granolaMeetingResolvePath(query, {
        includeTranscript: options.requireCache,
      }),
    );
  }

  async listExportJobs(
    options: GranolaExportJobsListOptions = {},
  ): Promise<GranolaExportJobsResult> {
    return await this.requestJson(granolaExportJobsPath(options));
  }

  async exportNotes(
    format: NoteOutputFormat = "markdown",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaNotesExportResult> {
    return await this.requestJson(granolaTransportPaths.exportNotes, {
      body: JSON.stringify({
        folderId: options.folderId,
        format,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async exportTranscripts(
    format: TranscriptOutputFormat = "text",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaTranscriptsExportResult> {
    return await this.requestJson(granolaTransportPaths.exportTranscripts, {
      body: JSON.stringify({
        folderId: options.folderId,
        format,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
  }

  async rerunExportJob(id: string): Promise<GranolaExportJobRunResult> {
    return await this.requestJson(granolaExportJobRerunPath(id), {
      method: "POST",
    });
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.#fetchImpl(new URL(path, this.url), {
      ...init,
      headers: mergeHeaders(
        {
          ...(this.#password ? { "x-granola-password": this.#password } : {}),
          accept: "application/json",
        },
        init.headers,
      ),
    });
    if (!response.ok) {
      throw await responseError(response);
    }

    return response;
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    return cloneValue((await response.json()) as T);
  }

  private emit(event: GranolaAppStateEvent): void {
    this.#state = cloneValue(event.state);
    const nextEvent = cloneValue(event);
    for (const listener of this.#listeners) {
      listener(nextEvent);
    }
  }

  private startEvents(): void {
    if (this.#eventLoop) {
      return;
    }

    this.#eventLoop = this.runEventsLoop();
  }

  private async runEventsLoop(): Promise<void> {
    while (!this.#closed) {
      const controller = new AbortController();
      this.#streamAbortController = controller;

      try {
        const response = await this.request(granolaTransportPaths.events, {
          headers: {
            accept: "text/event-stream",
          },
          signal: controller.signal,
        });
        await this.consumeEventStream(response);
      } catch {
        if (this.#closed || controller.signal.aborted) {
          break;
        }

        await new Promise((resolve) => {
          setTimeout(resolve, this.#reconnectDelayMs);
        });
      }
    }
  }

  private async consumeEventStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("server did not provide an event stream");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (!this.#closed) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");

      while (true) {
        const boundary = buffer.indexOf("\n\n");
        if (boundary < 0) {
          break;
        }

        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseEvent(chunk);
        if (event) {
          this.emit(event);
        }
      }
    }
  }
}

export async function createGranolaServerClient(
  serverUrl: string | URL,
  options: GranolaServerClientOptions = {},
): Promise<GranolaServerClient> {
  return await GranolaServerClient.connect(serverUrl, options);
}
