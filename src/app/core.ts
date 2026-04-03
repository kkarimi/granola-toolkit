import { existsSync } from "node:fs";

import {
  createDefaultGranolaRuntime,
  inspectDefaultGranolaAuth,
  loadOptionalGranolaCache,
  type DefaultGranolaAuthInfo,
} from "../client/default.ts";
import type { GranolaApiClient } from "../client/granola.ts";
import { buildMeetingRecord, listMeetings, resolveMeeting } from "../meetings.ts";
import { writeNotes } from "../notes.ts";
import { writeTranscripts } from "../transcripts.ts";
import type {
  AppConfig,
  CacheData,
  GranolaDocument,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../types.ts";
import { granolaCacheCandidates } from "../utils.ts";

import type {
  GranolaAppAuthState,
  GranolaAppExportRunState,
  GranolaAppState,
  GranolaAppSurface,
  GranolaMeetingBundle,
  GranolaMeetingListOptions,
  GranolaNotesExportResult,
  GranolaTranscriptsExportResult,
} from "./types.ts";

type GranolaDocumentsClient = Pick<GranolaApiClient, "listDocuments">;

interface GranolaAppDependencies {
  auth: GranolaAppAuthState;
  cacheLoader: (cacheFile?: string) => Promise<CacheData | undefined>;
  createGranolaClient?: () => Promise<{
    auth: GranolaAppAuthState;
    client: GranolaDocumentsClient;
  }>;
  granolaClient?: GranolaDocumentsClient;
  now?: () => Date;
}

function transcriptCount(cacheData: CacheData): number {
  return Object.values(cacheData.transcripts).filter((segments) => segments.length > 0).length;
}

function cloneExportState(state?: GranolaAppExportRunState): GranolaAppExportRunState | undefined {
  return state ? { ...state } : undefined;
}

function cloneState(state: GranolaAppState): GranolaAppState {
  return {
    auth: { ...state.auth },
    cache: { ...state.cache },
    config: {
      ...state.config,
      notes: { ...state.config.notes },
      transcripts: { ...state.config.transcripts },
    },
    documents: { ...state.documents },
    exports: {
      notes: cloneExportState(state.exports.notes),
      transcripts: cloneExportState(state.exports.transcripts),
    },
    ui: { ...state.ui },
  };
}

function defaultState(
  config: AppConfig,
  auth: GranolaAppAuthState,
  surface: GranolaAppSurface,
): GranolaAppState {
  return {
    auth: { ...auth },
    cache: {
      configured: Boolean(config.transcripts.cacheFile),
      documentCount: 0,
      filePath: config.transcripts.cacheFile || undefined,
      loaded: false,
      transcriptCount: 0,
    },
    config: {
      ...config,
      notes: { ...config.notes },
      transcripts: { ...config.transcripts },
    },
    documents: {
      count: 0,
      loaded: false,
    },
    exports: {},
    ui: {
      surface,
      view: "idle",
    },
  };
}

export class GranolaApp {
  #cacheData?: CacheData;
  #cacheResolved = false;
  #granolaClient?: GranolaDocumentsClient;
  #documents?: GranolaDocument[];
  readonly #state: GranolaAppState;

  constructor(
    readonly config: AppConfig,
    private readonly deps: GranolaAppDependencies,
    options: { surface?: GranolaAppSurface } = {},
  ) {
    this.#state = defaultState(config, deps.auth, options.surface ?? "cli");
  }

  getState(): GranolaAppState {
    return cloneState(this.#state);
  }

  setUiState(patch: Partial<GranolaAppState["ui"]>): GranolaAppState {
    this.#state.ui = {
      ...this.#state.ui,
      ...patch,
    };
    return this.getState();
  }

  private nowIso(): string {
    return (this.deps.now ?? (() => new Date()))().toISOString();
  }

  private async getGranolaClient(): Promise<GranolaDocumentsClient> {
    if (this.#granolaClient) {
      return this.#granolaClient;
    }

    if (this.deps.granolaClient) {
      this.#granolaClient = this.deps.granolaClient;
      return this.#granolaClient;
    }

    if (!this.deps.createGranolaClient) {
      throw new Error("Granola API client is not configured");
    }

    const runtime = await this.deps.createGranolaClient();
    this.#granolaClient = runtime.client;
    this.#state.auth = { ...runtime.auth };
    return this.#granolaClient;
  }

  private missingCacheError(): Error {
    return new Error(
      `Granola cache file not found. Pass --cache or create .granola.toml. Expected locations include: ${granolaCacheCandidates().join(", ")}`,
    );
  }

  async listDocuments(): Promise<GranolaDocument[]> {
    if (this.#documents) {
      return this.#documents;
    }

    const documents = await (
      await this.getGranolaClient()
    ).listDocuments({
      timeoutMs: this.config.notes.timeoutMs,
    });

    this.#documents = documents;
    this.#state.documents = {
      count: documents.length,
      loaded: true,
      loadedAt: this.nowIso(),
    };
    return documents;
  }

  async loadCache(options: { required?: boolean } = {}): Promise<CacheData | undefined> {
    if (this.#cacheResolved) {
      if (options.required && !this.#cacheData) {
        throw this.missingCacheError();
      }
      return this.#cacheData;
    }

    const cacheFile = this.config.transcripts.cacheFile || undefined;
    if (!cacheFile) {
      this.#cacheResolved = true;
      if (options.required) {
        throw this.missingCacheError();
      }
      return undefined;
    }

    if (!existsSync(cacheFile)) {
      throw new Error(`Granola cache file not found: ${cacheFile}`);
    }

    const cacheData = await this.deps.cacheLoader(cacheFile);
    this.#cacheResolved = true;
    this.#cacheData = cacheData;
    this.#state.cache = {
      configured: true,
      documentCount: cacheData ? Object.keys(cacheData.documents).length : 0,
      filePath: cacheFile,
      loaded: Boolean(cacheData),
      loadedAt: cacheData ? this.nowIso() : undefined,
      transcriptCount: cacheData ? transcriptCount(cacheData) : 0,
    };

    if (options.required && !cacheData) {
      throw this.missingCacheError();
    }

    return cacheData;
  }

  async listMeetings(options: GranolaMeetingListOptions = {}) {
    const documents = await this.listDocuments();
    const cacheData = await this.loadCache();
    const meetings = listMeetings(documents, {
      cacheData,
      limit: options.limit,
      search: options.search,
    });

    this.setUiState({
      meetingSearch: options.search,
      selectedMeetingId: undefined,
      view: "meeting-list",
    });

    return meetings;
  }

  async getMeeting(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    const documents = await this.listDocuments();
    const cacheData = await this.loadCache({ required: options.requireCache });
    const document = resolveMeeting(documents, id);
    const meeting = buildMeetingRecord(document, cacheData);

    this.setUiState({
      selectedMeetingId: document.id,
      view: "meeting-detail",
    });

    return {
      cacheData,
      document,
      meeting,
    };
  }

  async exportNotes(format: NoteOutputFormat = "markdown"): Promise<GranolaNotesExportResult> {
    const documents = await this.listDocuments();
    const written = await writeNotes(documents, this.config.notes.output, format);

    this.#state.exports.notes = {
      format,
      itemCount: documents.length,
      outputDir: this.config.notes.output,
      ranAt: this.nowIso(),
      written,
    };
    this.setUiState({
      view: "notes-export",
    });

    return {
      documentCount: documents.length,
      documents,
      format,
      outputDir: this.config.notes.output,
      written,
    };
  }

  async exportTranscripts(
    format: TranscriptOutputFormat = "text",
  ): Promise<GranolaTranscriptsExportResult> {
    const cacheData = await this.loadCache({ required: true });
    if (!cacheData) {
      throw this.missingCacheError();
    }

    const written = await writeTranscripts(cacheData, this.config.transcripts.output, format);
    const count = transcriptCount(cacheData);

    this.#state.exports.transcripts = {
      format,
      itemCount: count,
      outputDir: this.config.transcripts.output,
      ranAt: this.nowIso(),
      written,
    };
    this.setUiState({
      view: "transcripts-export",
    });

    return {
      cacheData,
      format,
      outputDir: this.config.transcripts.output,
      transcriptCount: count,
      written,
    };
  }
}

export async function createGranolaApp(
  config: AppConfig,
  options: {
    logger?: Pick<Console, "warn">;
    now?: () => Date;
    surface?: GranolaAppSurface;
  } = {},
): Promise<GranolaApp> {
  const auth = await inspectDefaultGranolaAuth(config);

  return new GranolaApp(
    config,
    {
      auth,
      cacheLoader: loadOptionalGranolaCache,
      createGranolaClient: async () => await createDefaultGranolaRuntime(config, options.logger),
      now: options.now,
    },
    { surface: options.surface },
  );
}

export type { DefaultGranolaAuthInfo };
