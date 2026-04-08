import { join, relative } from "node:path";

import {
  allExportScope,
  cloneExportScope,
  folderExportScope,
  resolveExportOutputDir,
} from "../export-scope.ts";
import {
  defaultExportTargetNotesFormat,
  defaultExportTargetTranscriptsFormat,
} from "../export-target-registry.ts";
import { resolveExportTargetOutputDir, type ExportTargetStore } from "../export-targets.ts";
import type { ExportJobStore } from "../export-jobs.ts";
import {
  renderObsidianNoteExport,
  renderObsidianTranscriptExport,
  syncObsidianDailyNotes,
} from "../obsidian-exports.ts";
import { noteFileStem, writeNotes } from "../notes.ts";
import { buildFolderSummary, resolveFolder } from "../folders.ts";
import { transcriptFileStem, writeTranscripts } from "../transcripts.ts";
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
  GranolaExportTarget,
  GranolaExportTargetsResult,
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
  exportTargetStore?: ExportTargetStore;
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

  async listTargets(): Promise<GranolaExportTargetsResult> {
    const targets = this.deps.exportTargetStore
      ? await this.deps.exportTargetStore.readTargets()
      : [];
    return {
      targets: targets.map((target) => ({ ...target })),
    };
  }

  async saveTargets(targets: GranolaExportTarget[]): Promise<GranolaExportTargetsResult> {
    if (!this.deps.exportTargetStore) {
      throw new Error("export target store is not configured");
    }

    await this.deps.exportTargetStore.writeTargets(targets.map((target) => ({ ...target })));
    return await this.listTargets();
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
    scopedOutput: boolean;
    scope: GranolaExportScope;
    target?: GranolaExportTarget;
  }> {
    const documents = await this.deps.listDocuments();
    const exportContext = await this.resolveExportContext(options.folderId);
    const target = await this.readExportTarget(options.targetId);
    const filteredDocuments = exportContext.documentIds
      ? documents.filter((document) => exportContext.documentIds!.has(document.id))
      : documents;

    return {
      documents: filteredDocuments,
      format,
      outputDir: await this.resolveNotesOutputDir(exportContext.scope, options),
      scopedOutput: options.scopedOutput === true,
      scope: exportContext.scope,
      target,
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
    documentContexts: Map<string, GranolaDocument>;
    format: TranscriptOutputFormat;
    outputDir: string;
    scopedOutput: boolean;
    scope: GranolaExportScope;
    target?: GranolaExportTarget;
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
    const target = await this.readExportTarget(options.targetId);
    const needsDocumentContexts = target?.kind === "obsidian-vault" && format === "markdown";
    const documents = needsDocumentContexts ? await this.deps.listDocuments() : [];
    const scopedDocuments = exportContext.documentIds
      ? documents.filter((document) => exportContext.documentIds!.has(document.id))
      : documents;

    return {
      cacheData: scopedCacheData,
      documentContexts: new Map(scopedDocuments.map((document) => [document.id, document])),
      format,
      outputDir: await this.resolveTranscriptsOutputDir(exportContext.scope, options),
      scopedOutput: options.scopedOutput === true,
      scope: exportContext.scope,
      target,
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
    scopedOutput: boolean,
    scope: GranolaExportScope,
    targetId?: string,
  ): Promise<GranolaAppExportJobState> {
    return await this.updateExportJob({
      completedCount: 0,
      format,
      id: this.deps.createExportJobId(kind),
      itemCount,
      kind,
      outputDir,
      scopedOutput,
      scope: cloneExportScope(scope),
      startedAt: this.deps.nowIso(),
      status: "running",
      targetId,
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
    scopedOutput?: boolean;
    scope: GranolaExportScope;
    target?: GranolaExportTarget;
    trackLastRun?: boolean;
    updateUi?: boolean;
  }): Promise<GranolaNotesExportResult> {
    let job = await this.startExportJob(
      "notes",
      options.format,
      options.documents.length,
      options.outputDir,
      options.scopedOutput === true,
      options.scope,
      options.target?.id,
    );
    let written = 0;
    const target = options.target;
    const targetTranscriptFormat = target
      ? (target.transcriptsFormat ?? defaultExportTargetTranscriptsFormat(target.kind))
      : undefined;
    const transcriptOutputDir = target
      ? resolveExportTargetOutputDir(target, "transcripts", options.scope, {
          scopedDirectory: options.scopedOutput,
        })
      : undefined;

    try {
      written = await writeNotes(options.documents, options.outputDir, options.format, {
        onProgress: async (progress) => {
          job = await this.setExportJobProgress(job, {
            completedCount: progress.completed,
            written: progress.written,
          });
        },
        renderMarkdown:
          target?.kind === "obsidian-vault" && options.format === "markdown"
            ? (note, document) =>
                renderObsidianNoteExport({
                  document,
                  note,
                  target,
                  transcriptRelativePath:
                    targetTranscriptFormat === "markdown" && transcriptOutputDir
                      ? relative(
                          target.outputDir,
                          join(
                            transcriptOutputDir,
                            `${transcriptFileStem({
                              createdAt: document.createdAt,
                              id: document.id,
                              title: document.title || document.id,
                              updatedAt: document.updatedAt,
                            })}.md`,
                          ),
                        ).replaceAll("\\", "/")
                      : undefined,
                })
            : undefined,
      });
      if (
        target?.kind === "obsidian-vault" &&
        options.format === "markdown" &&
        options.scope.mode === "all"
      ) {
        written += await syncObsidianDailyNotes({
          documents: options.documents,
          notesFormat: options.format,
          outputDir: target.outputDir,
          target,
          transcriptsFormat: targetTranscriptFormat,
        });
      }
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
        targetId: options.target?.id,
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
      targetId: options.target?.id,
      written,
    };
  }

  async runTranscriptsExport(options: {
    cacheData: CacheData;
    documentContexts?: Map<string, GranolaDocument>;
    format: TranscriptOutputFormat;
    outputDir: string;
    scopedOutput?: boolean;
    scope: GranolaExportScope;
    target?: GranolaExportTarget;
    trackLastRun?: boolean;
    updateUi?: boolean;
  }): Promise<GranolaTranscriptsExportResult> {
    const count = transcriptCount(options.cacheData);
    let job = await this.startExportJob(
      "transcripts",
      options.format,
      count,
      options.outputDir,
      options.scopedOutput === true,
      options.scope,
      options.target?.id,
    );
    let written = 0;
    const target = options.target;
    const targetNoteFormat = target
      ? (target.notesFormat ?? defaultExportTargetNotesFormat(target.kind))
      : undefined;
    const notesOutputDir = target
      ? resolveExportTargetOutputDir(target, "notes", options.scope, {
          scopedDirectory: options.scopedOutput,
        })
      : undefined;

    try {
      written = await writeTranscripts(options.cacheData, options.outputDir, options.format, {
        onProgress: async (progress) => {
          job = await this.setExportJobProgress(job, {
            completedCount: progress.completed,
            written: progress.written,
          });
        },
        renderContent:
          target?.kind === "obsidian-vault" && options.format === "markdown"
            ? (transcript, document) => {
                const fullDocument = options.documentContexts?.get(document.id) ?? {
                  content: "",
                  createdAt: document.createdAt,
                  folderMemberships: [],
                  id: document.id,
                  notesPlain: "",
                  tags: [],
                  title: document.title,
                  updatedAt: document.updatedAt,
                };
                return renderObsidianTranscriptExport({
                  document: fullDocument,
                  noteRelativePath:
                    targetNoteFormat === "markdown" && notesOutputDir
                      ? relative(
                          target.outputDir,
                          join(notesOutputDir, `${noteFileStem(fullDocument)}.md`),
                        ).replaceAll("\\", "/")
                      : undefined,
                  target,
                  transcript,
                });
              }
            : undefined,
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
        targetId: options.target?.id,
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
      targetId: options.target?.id,
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

  private async readExportTarget(
    targetId: string | undefined,
  ): Promise<GranolaExportTarget | undefined> {
    if (!targetId) {
      return undefined;
    }

    if (!this.deps.exportTargetStore) {
      throw new Error("export target store is not configured");
    }

    const target = (await this.deps.exportTargetStore.readTargets()).find(
      (candidate) => candidate.id === targetId,
    );
    if (!target) {
      throw new Error(`export target not found: ${targetId}`);
    }

    return { ...target };
  }

  private async resolveNotesOutputDir(
    scope: GranolaExportScope,
    options: GranolaExportRunOptions,
  ): Promise<string> {
    const target = await this.readExportTarget(options.targetId);
    if (target) {
      return resolveExportTargetOutputDir(target, "notes", scope, {
        scopedDirectory: options.scopedOutput,
      });
    }

    return resolveExportOutputDir(options.outputDir ?? this.deps.config.notes.output, scope, {
      scopedDirectory: options.scopedOutput,
    });
  }

  private async resolveTranscriptsOutputDir(
    scope: GranolaExportScope,
    options: GranolaExportRunOptions,
  ): Promise<string> {
    const target = await this.readExportTarget(options.targetId);
    if (target) {
      return resolveExportTargetOutputDir(target, "transcripts", scope, {
        scopedDirectory: options.scopedOutput,
      });
    }

    return resolveExportOutputDir(options.outputDir ?? this.deps.config.transcripts.output, scope, {
      scopedDirectory: options.scopedOutput,
    });
  }
}
