import {
  allExportScope,
  cloneExportScope,
  folderExportScope,
  resolveExportOutputDir,
} from "../export-scope.ts";
import type { ExportJobStore } from "../export-jobs.ts";
import { writeNotes } from "../notes.ts";
import { buildFolderSummary, resolveFolder } from "../folders.ts";
import { writeTranscripts } from "../transcripts.ts";
import type {
  AppConfig,
  CacheData,
  GranolaDocument,
  GranolaFolder,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../types.ts";

import type {
  GranolaAppExportJobState,
  GranolaAppExportRunState,
  GranolaExportJobKind,
  GranolaExportJobsListOptions,
  GranolaExportJobsResult,
  GranolaExportRunOptions,
  GranolaExportScope,
  GranolaNotesExportResult,
  GranolaTranscriptsExportResult,
} from "./types.ts";
import {
  createDefaultGranolaExporterRegistry,
  type GranolaExporterRegistry,
} from "./export-registry.ts";

export function cloneGranolaExportRunState(
  state?: GranolaAppExportRunState,
): GranolaAppExportRunState | undefined {
  return state
    ? {
        ...state,
        scope: cloneExportScope(state.scope),
      }
    : undefined;
}

export function cloneGranolaExportJobState(
  job: GranolaAppExportJobState,
): GranolaAppExportJobState {
  return {
    ...job,
    scope: cloneExportScope(job.scope),
  };
}

function transcriptCount(cacheData: CacheData): number {
  return Object.values(cacheData.transcripts).filter((segments) => segments.length > 0).length;
}

interface GranolaExportServiceDependencies {
  config: Pick<AppConfig, "notes" | "transcripts">;
  createExportJobId: (kind: GranolaExportJobKind) => string;
  emitStateUpdate: () => void;
  exportJobStore?: ExportJobStore;
  exporterRegistry?: GranolaExporterRegistry;
  loadCache: (options?: { required?: boolean }) => Promise<CacheData | undefined>;
  loadFolders: (options?: {
    forceRefresh?: boolean;
    required?: boolean;
  }) => Promise<GranolaFolder[] | undefined>;
  listDocuments: () => Promise<GranolaDocument[]>;
  nowIso: () => string;
  state: {
    jobs: GranolaAppExportJobState[];
    notes?: GranolaAppExportRunState;
    transcripts?: GranolaAppExportRunState;
  };
}

export class GranolaExportService {
  readonly #exporters: GranolaExporterRegistry;

  constructor(private readonly deps: GranolaExportServiceDependencies) {
    this.#exporters = deps.exporterRegistry ?? createDefaultGranolaExporterRegistry();
  }

  async listJobs(options: GranolaExportJobsListOptions = {}): Promise<GranolaExportJobsResult> {
    const limit = options.limit ?? 20;
    const jobs = this.deps.state.jobs.slice(0, limit).map((job) => cloneGranolaExportJobState(job));

    return {
      jobs,
    };
  }

  async exportNotes(
    format: NoteOutputFormat = "markdown",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaNotesExportResult> {
    return (await this.#exporters
      .resolve("notes", "exporter")
      .export(this, format, options)) as GranolaNotesExportResult;
  }

  async prepareNotesExport(
    format: NoteOutputFormat = "markdown",
    options: GranolaExportRunOptions = {},
  ): Promise<{
    documents: GranolaDocument[];
    format: NoteOutputFormat;
    outputDir: string;
    scope: GranolaExportScope;
  }> {
    const documents = await this.deps.listDocuments();
    const exportContext = await this.resolveExportContext(options.folderId);
    const filteredDocuments = exportContext.documentIds
      ? documents.filter((document) => exportContext.documentIds!.has(document.id))
      : documents;

    return {
      documents: filteredDocuments,
      format,
      outputDir: resolveExportOutputDir(
        options.outputDir ?? this.deps.config.notes.output,
        exportContext.scope,
        {
          scopedDirectory: options.scopedOutput,
        },
      ),
      scope: exportContext.scope,
    };
  }

  async exportTranscripts(
    format: TranscriptOutputFormat = "text",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaTranscriptsExportResult> {
    return (await this.#exporters
      .resolve("transcripts", "exporter")
      .export(this, format, options)) as GranolaTranscriptsExportResult;
  }

  async prepareTranscriptsExport(
    format: TranscriptOutputFormat = "text",
    options: GranolaExportRunOptions = {},
  ): Promise<{
    cacheData: CacheData;
    format: TranscriptOutputFormat;
    outputDir: string;
    scope: GranolaExportScope;
  }> {
    const cacheData = await this.deps.loadCache({ required: true });
    if (!cacheData) {
      throw new Error("Granola cache file is required for transcript export");
    }

    const exportContext = await this.resolveExportContext(options.folderId);
    const scopedCacheData = exportContext.documentIds
      ? {
          documents: Object.fromEntries(
            Object.entries(cacheData.documents).filter(([id]) =>
              exportContext.documentIds!.has(id),
            ),
          ),
          transcripts: Object.fromEntries(
            Object.entries(cacheData.transcripts).filter(([id]) =>
              exportContext.documentIds!.has(id),
            ),
          ),
        }
      : cacheData;

    return {
      cacheData: scopedCacheData,
      format,
      outputDir: resolveExportOutputDir(
        options.outputDir ?? this.deps.config.transcripts.output,
        exportContext.scope,
        {
          scopedDirectory: options.scopedOutput,
        },
      ),
      scope: exportContext.scope,
    };
  }

  async rerunJob(id: string): Promise<GranolaNotesExportResult | GranolaTranscriptsExportResult> {
    const job = this.deps.state.jobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`export job not found: ${id}`);
    }

    return await this.#exporters.resolve(job.kind, "exporter").rerun(this, job);
  }

  private async persistExportJobs(): Promise<void> {
    if (!this.deps.exportJobStore) {
      return;
    }

    await this.deps.exportJobStore.writeJobs(this.deps.state.jobs);
  }

  private async updateExportJob(job: GranolaAppExportJobState): Promise<GranolaAppExportJobState> {
    const nextJobs = [
      cloneGranolaExportJobState(job),
      ...this.deps.state.jobs
        .filter((candidate) => candidate.id !== job.id)
        .map((candidate) => cloneGranolaExportJobState(candidate)),
    ].slice(0, 100);

    this.deps.state.jobs = nextJobs;
    await this.persistExportJobs();
    this.deps.emitStateUpdate();
    return cloneGranolaExportJobState(job);
  }

  private async startExportJob(
    kind: "notes" | "transcripts",
    format: string,
    itemCount: number,
    outputDir: string,
    scope: GranolaExportScope,
  ): Promise<GranolaAppExportJobState> {
    return await this.updateExportJob({
      completedCount: 0,
      format,
      id: this.deps.createExportJobId(kind),
      itemCount,
      kind,
      outputDir,
      scope: cloneExportScope(scope),
      startedAt: this.deps.nowIso(),
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
      finishedAt: this.deps.nowIso(),
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
      finishedAt: this.deps.nowIso(),
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

  async runNotesExport(options: {
    documents: GranolaDocument[];
    format: NoteOutputFormat;
    outputDir: string;
    scope: GranolaExportScope;
    trackLastRun?: boolean;
    updateUi?: boolean;
  }): Promise<GranolaNotesExportResult> {
    let job = await this.startExportJob(
      "notes",
      options.format,
      options.documents.length,
      options.outputDir,
      options.scope,
    );
    let written = 0;

    try {
      written = await writeNotes(options.documents, options.outputDir, options.format, {
        onProgress: async (progress) => {
          job = await this.setExportJobProgress(job, {
            completedCount: progress.completed,
            written: progress.written,
          });
        },
      });
      job = await this.completeExportJob(job, {
        completedCount: options.documents.length,
        written,
      });
    } catch (error) {
      await this.failExportJob(job, error);
      throw error;
    }

    if (options.trackLastRun !== false) {
      this.deps.state.notes = {
        format: options.format,
        itemCount: options.documents.length,
        jobId: job.id,
        outputDir: options.outputDir,
        ranAt: this.deps.nowIso(),
        scope: cloneExportScope(options.scope),
        written,
      };
    }
    this.deps.emitStateUpdate();

    return {
      documentCount: options.documents.length,
      documents: options.documents,
      format: options.format,
      job,
      outputDir: options.outputDir,
      scope: cloneExportScope(options.scope),
      written,
    };
  }

  async runTranscriptsExport(options: {
    cacheData: CacheData;
    format: TranscriptOutputFormat;
    outputDir: string;
    scope: GranolaExportScope;
    trackLastRun?: boolean;
    updateUi?: boolean;
  }): Promise<GranolaTranscriptsExportResult> {
    const count = transcriptCount(options.cacheData);
    let job = await this.startExportJob(
      "transcripts",
      options.format,
      count,
      options.outputDir,
      options.scope,
    );
    let written = 0;

    try {
      written = await writeTranscripts(options.cacheData, options.outputDir, options.format, {
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

    if (options.trackLastRun !== false) {
      this.deps.state.transcripts = {
        format: options.format,
        itemCount: count,
        jobId: job.id,
        outputDir: options.outputDir,
        ranAt: this.deps.nowIso(),
        scope: cloneExportScope(options.scope),
        written,
      };
    }
    this.deps.emitStateUpdate();

    return {
      cacheData: options.cacheData,
      format: options.format,
      job,
      outputDir: options.outputDir,
      scope: cloneExportScope(options.scope),
      transcriptCount: count,
      written,
    };
  }

  private async resolveExportContext(folderId?: string): Promise<{
    documentIds?: Set<string>;
    scope: GranolaExportScope;
  }> {
    if (!folderId) {
      return {
        scope: allExportScope(),
      };
    }

    const folders = await this.deps.loadFolders({
      required: true,
    });
    const summaries = (folders ?? []).map((folder) => buildFolderSummary(folder));
    const summary = resolveFolder(summaries, folderId);
    const rawFolder = (folders ?? []).find((candidate) => candidate.id === summary.id);
    if (!rawFolder) {
      throw new Error(`folder not found: ${folderId}`);
    }

    return {
      documentIds: new Set(rawFolder.documentIds),
      scope: folderExportScope(summary),
    };
  }
}
