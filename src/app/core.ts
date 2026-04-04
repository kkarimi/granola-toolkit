import { existsSync } from "node:fs";

import {
  createDefaultGranolaRuntime,
  inspectDefaultGranolaAuth,
  loadOptionalGranolaCache,
  type DefaultGranolaAuthInfo,
} from "../client/default.ts";
import type { GranolaApiClient } from "../client/granola.ts";
import {
  createDefaultExportJobStore,
  createExportJobId,
  type ExportJobStore,
} from "../export-jobs.ts";
import {
  buildMeetingRecord,
  listMeetings,
  resolveMeeting,
  resolveMeetingQuery,
} from "../meetings.ts";
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
  GranolaAppExportJobState,
  GranolaAppExportRunState,
  GranolaExportJobsListOptions,
  GranolaExportJobsResult,
  GranolaAppStateEvent,
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
  exportJobStore?: ExportJobStore;
  exportJobs?: GranolaAppExportJobState[];
  granolaClient?: GranolaDocumentsClient;
  now?: () => Date;
}

function transcriptCount(cacheData: CacheData): number {
  return Object.values(cacheData.transcripts).filter((segments) => segments.length > 0).length;
}

function cloneExportState(state?: GranolaAppExportRunState): GranolaAppExportRunState | undefined {
  return state ? { ...state } : undefined;
}

function cloneExportJob(job: GranolaAppExportJobState): GranolaAppExportJobState {
  return { ...job };
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
      jobs: state.exports.jobs.map((job) => cloneExportJob(job)),
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
    exports: {
      jobs: [],
    },
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
  #listeners = new Set<(event: GranolaAppStateEvent) => void>();
  readonly #state: GranolaAppState;

  constructor(
    readonly config: AppConfig,
    private readonly deps: GranolaAppDependencies,
    options: { surface?: GranolaAppSurface } = {},
  ) {
    this.#state = defaultState(config, deps.auth, options.surface ?? "cli");
    this.#state.exports.jobs = (deps.exportJobs ?? []).map((job) => cloneExportJob(job));
  }

  getState(): GranolaAppState {
    return cloneState(this.#state);
  }

  subscribe(listener: (event: GranolaAppStateEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  setUiState(patch: Partial<GranolaAppState["ui"]>): GranolaAppState {
    this.#state.ui = {
      ...this.#state.ui,
      ...patch,
    };
    this.emitStateUpdate();
    return this.getState();
  }

  private nowIso(): string {
    return (this.deps.now ?? (() => new Date()))().toISOString();
  }

  private emitStateUpdate(): void {
    const event: GranolaAppStateEvent = {
      state: this.getState(),
      timestamp: this.nowIso(),
      type: "state.updated",
    };

    for (const listener of this.#listeners) {
      listener(event);
    }
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
    this.emitStateUpdate();
    return this.#granolaClient;
  }

  private missingCacheError(): Error {
    return new Error(
      `Granola cache file not found. Pass --cache or create .granola.toml. Expected locations include: ${granolaCacheCandidates().join(", ")}`,
    );
  }

  private async persistExportJobs(): Promise<void> {
    if (!this.deps.exportJobStore) {
      return;
    }

    await this.deps.exportJobStore.writeJobs(this.#state.exports.jobs);
  }

  private async updateExportJob(job: GranolaAppExportJobState): Promise<GranolaAppExportJobState> {
    const nextJobs = [
      cloneExportJob(job),
      ...this.#state.exports.jobs
        .filter((candidate) => candidate.id !== job.id)
        .map(cloneExportJob),
    ].slice(0, 100);

    this.#state.exports.jobs = nextJobs;
    await this.persistExportJobs();
    this.emitStateUpdate();
    return cloneExportJob(job);
  }

  private async startExportJob(
    kind: "notes" | "transcripts",
    format: string,
    itemCount: number,
    outputDir: string,
  ): Promise<GranolaAppExportJobState> {
    return await this.updateExportJob({
      completedCount: 0,
      format,
      id: createExportJobId(kind),
      itemCount,
      kind,
      outputDir,
      startedAt: this.nowIso(),
      status: "running",
      written: 0,
    });
  }

  private async completeExportJob(
    job: GranolaAppExportJobState,
    patch: {
      completedCount: number;
      written: number;
    },
  ): Promise<GranolaAppExportJobState> {
    return await this.updateExportJob({
      ...job,
      completedCount: patch.completedCount,
      finishedAt: this.nowIso(),
      status: "completed",
      written: patch.written,
    });
  }

  private async failExportJob(
    job: GranolaAppExportJobState,
    error: unknown,
  ): Promise<GranolaAppExportJobState> {
    const message = error instanceof Error ? error.message : String(error);
    return await this.updateExportJob({
      ...job,
      error: message,
      finishedAt: this.nowIso(),
      status: "failed",
    });
  }

  private async setExportJobProgress(
    job: GranolaAppExportJobState,
    patch: {
      completedCount: number;
      written: number;
    },
  ): Promise<GranolaAppExportJobState> {
    return await this.updateExportJob({
      ...job,
      completedCount: patch.completedCount,
      written: patch.written,
    });
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
    this.emitStateUpdate();
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
    this.emitStateUpdate();

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
      sort: options.sort,
      updatedFrom: options.updatedFrom,
      updatedTo: options.updatedTo,
    });

    this.setUiState({
      meetingSearch: options.search,
      meetingSort: options.sort,
      meetingUpdatedFrom: options.updatedFrom,
      meetingUpdatedTo: options.updatedTo,
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

  async findMeeting(
    query: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    const documents = await this.listDocuments();
    const cacheData = await this.loadCache({ required: options.requireCache });
    const document = resolveMeetingQuery(documents, query);
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

  async listExportJobs(
    options: GranolaExportJobsListOptions = {},
  ): Promise<GranolaExportJobsResult> {
    const limit = options.limit ?? 20;
    const jobs = this.#state.exports.jobs.slice(0, limit).map((job) => cloneExportJob(job));

    this.setUiState({
      view: "exports-history",
    });

    return {
      jobs,
    };
  }

  async exportNotes(format: NoteOutputFormat = "markdown"): Promise<GranolaNotesExportResult> {
    return await this.runNotesExport({
      format,
      outputDir: this.config.notes.output,
    });
  }

  private async runNotesExport(options: {
    format: NoteOutputFormat;
    outputDir: string;
  }): Promise<GranolaNotesExportResult> {
    const documents = await this.listDocuments();
    let job = await this.startExportJob(
      "notes",
      options.format,
      documents.length,
      options.outputDir,
    );
    let written = 0;

    try {
      written = await writeNotes(documents, options.outputDir, options.format, {
        onProgress: async (progress) => {
          job = await this.setExportJobProgress(job, {
            completedCount: progress.completed,
            written: progress.written,
          });
        },
      });
      job = await this.completeExportJob(job, {
        completedCount: documents.length,
        written,
      });
    } catch (error) {
      await this.failExportJob(job, error);
      throw error;
    }

    this.#state.exports.notes = {
      format: options.format,
      itemCount: documents.length,
      jobId: job.id,
      outputDir: options.outputDir,
      ranAt: this.nowIso(),
      written,
    };
    this.emitStateUpdate();
    this.setUiState({
      view: "notes-export",
    });

    return {
      documentCount: documents.length,
      documents,
      format: options.format,
      job,
      outputDir: options.outputDir,
      written,
    };
  }

  async exportTranscripts(
    format: TranscriptOutputFormat = "text",
  ): Promise<GranolaTranscriptsExportResult> {
    return await this.runTranscriptsExport({
      format,
      outputDir: this.config.transcripts.output,
    });
  }

  private async runTranscriptsExport(options: {
    format: TranscriptOutputFormat;
    outputDir: string;
  }): Promise<GranolaTranscriptsExportResult> {
    const cacheData = await this.loadCache({ required: true });
    if (!cacheData) {
      throw this.missingCacheError();
    }

    const count = transcriptCount(cacheData);
    let job = await this.startExportJob("transcripts", options.format, count, options.outputDir);
    let written = 0;

    try {
      written = await writeTranscripts(cacheData, options.outputDir, options.format, {
        onProgress: async (progress) => {
          job = await this.setExportJobProgress(job, {
            completedCount: progress.completed,
            written: progress.written,
          });
        },
      });
      job = await this.completeExportJob(job, {
        completedCount: count,
        written,
      });
    } catch (error) {
      await this.failExportJob(job, error);
      throw error;
    }

    this.#state.exports.transcripts = {
      format: options.format,
      itemCount: count,
      jobId: job.id,
      outputDir: options.outputDir,
      ranAt: this.nowIso(),
      written,
    };
    this.emitStateUpdate();
    this.setUiState({
      view: "transcripts-export",
    });

    return {
      cacheData,
      format: options.format,
      job,
      outputDir: options.outputDir,
      transcriptCount: count,
      written,
    };
  }

  async rerunExportJob(
    id: string,
  ): Promise<GranolaNotesExportResult | GranolaTranscriptsExportResult> {
    const job = this.#state.exports.jobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`export job not found: ${id}`);
    }

    if (job.kind === "notes") {
      return await this.runNotesExport({
        format: job.format as NoteOutputFormat,
        outputDir: job.outputDir,
      });
    }

    return await this.runTranscriptsExport({
      format: job.format as TranscriptOutputFormat,
      outputDir: job.outputDir,
    });
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
  const exportJobStore = createDefaultExportJobStore();
  const exportJobs = await exportJobStore.readJobs();

  return new GranolaApp(
    config,
    {
      auth,
      cacheLoader: loadOptionalGranolaCache,
      createGranolaClient: async () => await createDefaultGranolaRuntime(config, options.logger),
      exportJobs,
      exportJobStore,
      now: options.now,
    },
    { surface: options.surface },
  );
}

export type { DefaultGranolaAuthInfo };
