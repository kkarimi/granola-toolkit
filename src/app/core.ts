import { existsSync } from "node:fs";

import {
  createDefaultAutomationMatchStore,
  defaultAutomationMatchesFilePath,
  type AutomationMatchStore,
} from "../automation-matches.ts";
import {
  createDefaultAutomationRuleStore,
  defaultAutomationRulesFilePath,
  matchAutomationRules,
  type AutomationRuleStore,
} from "../automation-rules.ts";
import {
  createDefaultGranolaAuthController,
  createDefaultGranolaRuntime,
  inspectDefaultGranolaAuth,
  loadOptionalGranolaCache,
  type DefaultGranolaAuthController,
  type DefaultGranolaAuthInfo,
} from "../client/default.ts";
import type { GranolaApiClient } from "../client/granola.ts";
import {
  createDefaultExportJobStore,
  createExportJobId,
  type ExportJobStore,
} from "../export-jobs.ts";
import {
  allExportScope,
  cloneExportScope,
  folderExportScope,
  resolveExportOutputDir,
} from "../export-scope.ts";
import {
  buildMeetingRecord,
  filterMeetingSummaries,
  listMeetings,
  resolveMeeting,
  resolveMeetingQuery,
} from "../meetings.ts";
import {
  buildFolderRecord,
  buildFolderSummary,
  filterFolders,
  resolveFolder,
  resolveFolderQuery,
} from "../folders.ts";
import type { GranolaFolder } from "../types.ts";
import {
  createDefaultMeetingIndexStore,
  defaultMeetingIndexFilePath,
  type MeetingIndexStore,
} from "../meeting-index.ts";
import { writeNotes } from "../notes.ts";
import {
  defaultSyncEventsFilePath,
  createDefaultSyncStateStore,
  defaultSyncStateFilePath,
  type SyncStateStore,
} from "../sync-state.ts";
import { createDefaultSyncEventStore, type SyncEventStore } from "../sync-events.ts";
import { buildSyncEvents, diffMeetingSummaries } from "../sync.ts";
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
  GranolaAppApi,
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaAutomationMatchesResult,
  GranolaAutomationRulesResult,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppExportRunState,
  GranolaAppSyncChange,
  GranolaAppSyncEvent,
  GranolaAppSyncEventsResult,
  GranolaAppSyncResult,
  GranolaAppSyncState,
  GranolaExportRunOptions,
  GranolaExportScope,
  GranolaExportJobsListOptions,
  GranolaExportJobsResult,
  GranolaAppStateEvent,
  GranolaAppState,
  GranolaAppSurface,
  GranolaFolderListOptions,
  GranolaFolderListResult,
  GranolaMeetingBundle,
  GranolaMeetingListOptions,
  GranolaMeetingListResult,
  GranolaNotesExportResult,
  GranolaTranscriptsExportResult,
} from "./types.ts";
import type { FolderRecord, FolderSummaryRecord, MeetingSummaryRecord } from "./models.ts";

type GranolaRemoteClient = Pick<GranolaApiClient, "listDocuments"> &
  Partial<Pick<GranolaApiClient, "listFolders">>;

interface GranolaAppDependencies {
  auth: GranolaAppAuthState;
  authController?: DefaultGranolaAuthController;
  automationMatchStore?: AutomationMatchStore;
  automationMatches?: GranolaAutomationMatch[];
  automationRuleStore?: AutomationRuleStore;
  automationRules?: GranolaAutomationRule[];
  cacheLoader: (cacheFile?: string) => Promise<CacheData | undefined>;
  createGranolaClient?: (mode?: GranolaAppAuthMode) => Promise<{
    auth: GranolaAppAuthState;
    client: GranolaRemoteClient;
  }>;
  exportJobStore?: ExportJobStore;
  exportJobs?: GranolaAppExportJobState[];
  granolaClient?: GranolaRemoteClient;
  meetingIndex?: MeetingSummaryRecord[];
  meetingIndexStore?: MeetingIndexStore;
  now?: () => Date;
  syncEventStore?: SyncEventStore;
  syncState?: GranolaAppSyncState;
  syncStateStore?: SyncStateStore;
}

function transcriptCount(cacheData: CacheData): number {
  return Object.values(cacheData.transcripts).filter((segments) => segments.length > 0).length;
}

function cloneExportState(state?: GranolaAppExportRunState): GranolaAppExportRunState | undefined {
  return state
    ? {
        ...state,
        scope: cloneExportScope(state.scope),
      }
    : undefined;
}

function cloneExportJob(job: GranolaAppExportJobState): GranolaAppExportJobState {
  return {
    ...job,
    scope: cloneExportScope(job.scope),
  };
}

function cloneFolderSummary(folder: FolderSummaryRecord): FolderSummaryRecord {
  return { ...folder };
}

function cloneSyncChange(change: GranolaAppSyncChange): GranolaAppSyncChange {
  return { ...change };
}

function cloneSyncState(state: GranolaAppSyncState): GranolaAppSyncState {
  return {
    ...state,
    lastChanges: state.lastChanges.map(cloneSyncChange),
    summary: state.summary ? { ...state.summary } : undefined,
  };
}

function cloneSyncEvent(event: GranolaAppSyncEvent): GranolaAppSyncEvent {
  return { ...event };
}

function cloneMeetingSummary(meeting: MeetingSummaryRecord): MeetingSummaryRecord {
  return {
    ...meeting,
    folders: Array.isArray(meeting.folders)
      ? meeting.folders.map((folder) => cloneFolderSummary(folder))
      : [],
    tags: [...meeting.tags],
  };
}

function cloneState(state: GranolaAppState): GranolaAppState {
  return {
    auth: { ...state.auth },
    automation: { ...state.automation },
    cache: { ...state.cache },
    config: {
      ...state.config,
      automation: state.config.automation ? { ...state.config.automation } : undefined,
      notes: { ...state.config.notes },
      transcripts: { ...state.config.transcripts },
    },
    documents: { ...state.documents },
    folders: { ...state.folders },
    exports: {
      jobs: state.exports.jobs.map((job) => cloneExportJob(job)),
      notes: cloneExportState(state.exports.notes),
      transcripts: cloneExportState(state.exports.transcripts),
    },
    index: { ...state.index },
    sync: cloneSyncState(state.sync),
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
    automation: {
      loaded: false,
      matchCount: 0,
      matchesFile: defaultAutomationMatchesFilePath(),
      ruleCount: 0,
      rulesFile: config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
    },
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
    folders: {
      count: 0,
      loaded: false,
    },
    exports: {
      jobs: [],
    },
    index: {
      available: false,
      filePath: defaultMeetingIndexFilePath(),
      loaded: false,
      meetingCount: 0,
    },
    sync: {
      eventCount: 0,
      eventsFile: defaultSyncEventsFilePath(),
      filePath: defaultSyncStateFilePath(),
      lastChanges: [],
      running: false,
    },
    ui: {
      surface,
      view: "idle",
    },
  };
}

export class GranolaApp implements GranolaAppApi {
  #automationMatches: GranolaAutomationMatch[];
  #automationRules: GranolaAutomationRule[];
  #cacheData?: CacheData;
  #cacheResolved = false;
  #folders?: GranolaFolder[];
  #granolaClient?: GranolaRemoteClient;
  #documents?: GranolaDocument[];
  #meetingIndex: MeetingSummaryRecord[];
  #listeners = new Set<(event: GranolaAppStateEvent) => void>();
  #refreshingMeetingIndex?: Promise<void>;
  readonly #state: GranolaAppState;

  constructor(
    readonly config: AppConfig,
    private readonly deps: GranolaAppDependencies,
    options: { surface?: GranolaAppSurface } = {},
  ) {
    this.#state = defaultState(config, deps.auth, options.surface ?? "cli");
    this.#automationMatches = (deps.automationMatches ?? []).map((match) => ({
      ...match,
      folders: match.folders.map((folder) => ({ ...folder })),
      tags: [...match.tags],
    }));
    this.#automationRules = (deps.automationRules ?? []).map((rule) => ({
      ...rule,
      when: {
        ...rule.when,
        eventKinds: rule.when.eventKinds ? [...rule.when.eventKinds] : undefined,
        folderIds: rule.when.folderIds ? [...rule.when.folderIds] : undefined,
        folderNames: rule.when.folderNames ? [...rule.when.folderNames] : undefined,
        meetingIds: rule.when.meetingIds ? [...rule.when.meetingIds] : undefined,
        tags: rule.when.tags ? [...rule.when.tags] : undefined,
        titleIncludes: rule.when.titleIncludes ? [...rule.when.titleIncludes] : undefined,
      },
    }));
    this.#state.exports.jobs = (deps.exportJobs ?? []).map((job) => cloneExportJob(job));
    this.#state.automation = {
      lastMatchedAt: this.#automationMatches[0]?.matchedAt,
      loaded: true,
      matchCount: this.#automationMatches.length,
      matchesFile: defaultAutomationMatchesFilePath(),
      ruleCount: this.#automationRules.length,
      rulesFile: config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
    };
    this.#meetingIndex = (deps.meetingIndex ?? []).map((meeting) => cloneMeetingSummary(meeting));
    this.#state.index = {
      available: this.#meetingIndex.length > 0,
      filePath: defaultMeetingIndexFilePath(),
      loaded: this.#meetingIndex.length > 0,
      loadedAt: this.#meetingIndex.length > 0 ? this.nowIso() : undefined,
      meetingCount: this.#meetingIndex.length,
    };
    this.#state.sync = {
      ...this.#state.sync,
      ...cloneSyncState(
        deps.syncState ?? {
          eventCount: 0,
          eventsFile: defaultSyncEventsFilePath(),
          filePath: defaultSyncStateFilePath(),
          lastChanges: [],
          running: false,
        },
      ),
    };
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

  private resetRemoteState(): void {
    this.#granolaClient = undefined;
    this.#folders = undefined;
    this.#documents = undefined;
    this.resetDocumentsState();
    this.resetFoldersState();
  }

  private resetDocumentsState(): void {
    this.#documents = undefined;
    this.#state.documents = {
      count: 0,
      loaded: false,
    };
  }

  private resetFoldersState(): void {
    this.#folders = undefined;
    this.#state.folders = {
      count: 0,
      loaded: false,
    };
  }

  private resetCacheState(): void {
    this.#cacheData = undefined;
    this.#cacheResolved = false;
    this.#state.cache = {
      configured: Boolean(this.config.transcripts.cacheFile),
      documentCount: 0,
      filePath: this.config.transcripts.cacheFile || undefined,
      loaded: false,
      transcriptCount: 0,
    };
  }

  private async persistSyncState(): Promise<void> {
    if (!this.deps.syncStateStore) {
      return;
    }

    await this.deps.syncStateStore.writeState(this.#state.sync);
  }

  private cloneAutomationRule(rule: GranolaAutomationRule): GranolaAutomationRule {
    return {
      ...rule,
      when: {
        ...rule.when,
        eventKinds: rule.when.eventKinds ? [...rule.when.eventKinds] : undefined,
        folderIds: rule.when.folderIds ? [...rule.when.folderIds] : undefined,
        folderNames: rule.when.folderNames ? [...rule.when.folderNames] : undefined,
        meetingIds: rule.when.meetingIds ? [...rule.when.meetingIds] : undefined,
        tags: rule.when.tags ? [...rule.when.tags] : undefined,
        titleIncludes: rule.when.titleIncludes ? [...rule.when.titleIncludes] : undefined,
      },
    };
  }

  private cloneAutomationMatch(match: GranolaAutomationMatch): GranolaAutomationMatch {
    return {
      ...match,
      folders: match.folders.map((folder) => ({ ...folder })),
      tags: [...match.tags],
    };
  }

  private async loadAutomationRules(
    options: { forceRefresh?: boolean } = {},
  ): Promise<GranolaAutomationRule[]> {
    if (this.#automationRules.length > 0 && !options.forceRefresh) {
      return this.#automationRules.map((rule) => this.cloneAutomationRule(rule));
    }

    if (!this.deps.automationRuleStore) {
      return [];
    }

    this.#automationRules = (await this.deps.automationRuleStore.readRules()).map((rule) =>
      this.cloneAutomationRule(rule),
    );
    this.#state.automation = {
      ...this.#state.automation,
      loaded: true,
      ruleCount: this.#automationRules.length,
      rulesFile: this.config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
    };
    this.emitStateUpdate();
    return this.#automationRules.map((rule) => this.cloneAutomationRule(rule));
  }

  private async appendAutomationMatches(matches: GranolaAutomationMatch[]): Promise<void> {
    if (matches.length === 0) {
      return;
    }

    if (this.deps.automationMatchStore) {
      await this.deps.automationMatchStore.appendMatches(matches);
    }

    this.#automationMatches.push(...matches.map((match) => this.cloneAutomationMatch(match)));
    this.#state.automation = {
      ...this.#state.automation,
      lastMatchedAt: matches.at(-1)?.matchedAt ?? this.#state.automation.lastMatchedAt,
      loaded: true,
      matchCount: this.#automationMatches.length,
    };
  }

  private createSyncRunId(): string {
    return `sync-${this.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "")}`;
  }

  private applyAuthState(
    auth: GranolaAppAuthState,
    options: {
      resetDocuments?: boolean;
      view?: GranolaAppState["ui"]["view"];
    } = {},
  ): GranolaAppAuthState {
    if (options.resetDocuments) {
      this.resetRemoteState();
    }

    this.#state.auth = { ...auth };
    if (options.view) {
      this.#state.ui = {
        ...this.#state.ui,
        view: options.view,
      };
    }
    this.emitStateUpdate();
    return { ...auth };
  }

  private async persistMeetingIndex(meetings: MeetingSummaryRecord[]): Promise<void> {
    this.#meetingIndex = meetings.map((meeting) => cloneMeetingSummary(meeting));
    this.#state.index = {
      available: this.#meetingIndex.length > 0,
      filePath: this.#state.index.filePath,
      loaded: this.#meetingIndex.length > 0,
      loadedAt: this.#meetingIndex.length > 0 ? this.nowIso() : undefined,
      meetingCount: this.#meetingIndex.length,
    };

    if (this.deps.meetingIndexStore) {
      await this.deps.meetingIndexStore.writeIndex(this.#meetingIndex);
    }

    this.emitStateUpdate();
  }

  private async liveMeetingSnapshot(options: { forceRefresh?: boolean } = {}): Promise<{
    cacheData?: CacheData;
    documents: GranolaDocument[];
    folders?: GranolaFolder[];
    meetings: MeetingSummaryRecord[];
  }> {
    const cacheData = await this.loadCache({
      forceRefresh: options.forceRefresh,
    });
    const documents = await this.listDocuments({
      forceRefresh: options.forceRefresh,
    });
    const folders = await this.loadFolders({
      forceRefresh: options.forceRefresh,
    });
    const meetings = listMeetings(documents, {
      cacheData,
      foldersByDocumentId: this.buildFoldersByDocumentId(folders),
      limit: Math.max(documents.length, 1),
      sort: "updated-desc",
    });

    return {
      cacheData,
      documents,
      folders,
      meetings,
    };
  }

  private triggerMeetingIndexRefresh(): void {
    if (this.#refreshingMeetingIndex) {
      return;
    }

    this.#refreshingMeetingIndex = (async () => {
      try {
        await this.runSync({ foreground: false });
      } catch {
        // Opportunistic background sync should not break the foreground view.
      } finally {
        this.#refreshingMeetingIndex = undefined;
      }
    })();
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

  private async getGranolaClient(): Promise<GranolaRemoteClient> {
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

    const runtime = await this.deps.createGranolaClient(this.#state.auth.mode);
    this.#granolaClient = runtime.client;
    this.applyAuthState(runtime.auth);
    return this.#granolaClient;
  }

  private buildFoldersByDocumentId(
    folders: GranolaFolder[] | undefined,
  ): Map<string, FolderSummaryRecord[]> | undefined {
    if (!folders || folders.length === 0) {
      return undefined;
    }

    const byDocumentId = new Map<string, FolderSummaryRecord[]>();
    for (const folder of folders) {
      const summary = buildFolderSummary(folder);
      for (const documentId of folder.documentIds) {
        const existing = byDocumentId.get(documentId) ?? [];
        existing.push(summary);
        byDocumentId.set(documentId, existing);
      }
    }

    for (const [documentId, summaries] of byDocumentId.entries()) {
      byDocumentId.set(
        documentId,
        summaries
          .slice()
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((folder) => cloneFolderSummary(folder)),
      );
    }

    return byDocumentId;
  }

  private deriveFoldersFromDocuments(documents: GranolaDocument[]): GranolaFolder[] | undefined {
    const byFolderId = new Map<string, GranolaFolder>();

    for (const document of documents) {
      for (const membership of document.folderMemberships ?? []) {
        const existing = byFolderId.get(membership.id);
        if (existing) {
          existing.documentIds = [...new Set([...existing.documentIds, document.id])];
          existing.updatedAt =
            existing.updatedAt.localeCompare(document.updatedAt) >= 0
              ? existing.updatedAt
              : document.updatedAt;
          if (!existing.createdAt || existing.createdAt.localeCompare(document.createdAt) > 0) {
            existing.createdAt = document.createdAt;
          }
          continue;
        }

        byFolderId.set(membership.id, {
          createdAt: document.createdAt,
          documentIds: [document.id],
          id: membership.id,
          isFavourite: false,
          name: membership.name,
          updatedAt: document.updatedAt,
        });
      }
    }

    if (byFolderId.size === 0) {
      return undefined;
    }

    return [...byFolderId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async loadFolders(
    options: {
      forceRefresh?: boolean;
      required?: boolean;
    } = {},
  ): Promise<GranolaFolder[] | undefined> {
    if (options.forceRefresh) {
      this.resetFoldersState();
      this.emitStateUpdate();
    }

    if (this.#folders) {
      return this.#folders.map((folder) => ({
        ...folder,
        documentIds: [...folder.documentIds],
      }));
    }

    const client = await this.getGranolaClient();
    if (!client.listFolders) {
      const documents = await this.listDocuments({
        forceRefresh: options.forceRefresh,
      });
      const folders = this.deriveFoldersFromDocuments(documents);
      if (folders) {
        this.#folders = folders.map((folder) => ({
          ...folder,
          documentIds: [...folder.documentIds],
        }));
        this.#state.folders = {
          count: folders.length,
          loaded: true,
          loadedAt: this.nowIso(),
        };
        this.emitStateUpdate();
        return this.#folders.map((folder) => ({
          ...folder,
          documentIds: [...folder.documentIds],
        }));
      }

      if (options.required) {
        throw new Error("Granola folder API is not configured");
      }
      return undefined;
    }

    try {
      const folders = await client.listFolders({
        timeoutMs: this.config.notes.timeoutMs,
      });
      this.#folders = folders.map((folder) => ({
        ...folder,
        documentIds: [...folder.documentIds],
      }));
      this.#state.folders = {
        count: this.#folders.length,
        loaded: true,
        loadedAt: this.nowIso(),
      };
      this.emitStateUpdate();
      return this.#folders.map((folder) => ({
        ...folder,
        documentIds: [...folder.documentIds],
      }));
    } catch (error) {
      if (options.required) {
        throw error;
      }
      return undefined;
    }
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
    scope: GranolaExportScope,
  ): Promise<GranolaAppExportJobState> {
    return await this.updateExportJob({
      completedCount: 0,
      format,
      id: createExportJobId(kind),
      itemCount,
      kind,
      outputDir,
      scope: cloneExportScope(scope),
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

  private requireAuthController(): DefaultGranolaAuthController {
    if (!this.deps.authController) {
      throw new Error("Granola auth control is not configured");
    }

    return this.deps.authController;
  }

  async inspectAuth(): Promise<GranolaAppAuthState> {
    if (!this.deps.authController) {
      return { ...this.#state.auth };
    }

    const auth = await this.deps.authController.inspect();
    return this.applyAuthState(auth, { view: "auth" });
  }

  async inspectSync(): Promise<GranolaAppSyncState> {
    return cloneSyncState(this.#state.sync);
  }

  async listSyncEvents(options: { limit?: number } = {}): Promise<GranolaAppSyncEventsResult> {
    if (!this.deps.syncEventStore) {
      return {
        events: [],
      };
    }

    return {
      events: (await this.deps.syncEventStore.readEvents(options.limit)).map(cloneSyncEvent),
    };
  }

  async listAutomationRules(): Promise<GranolaAutomationRulesResult> {
    const rules = await this.loadAutomationRules({ forceRefresh: true });
    this.setUiState({
      view: "idle",
    });
    return {
      rules: rules.map((rule) => this.cloneAutomationRule(rule)),
    };
  }

  async listAutomationMatches(
    options: { limit?: number } = {},
  ): Promise<GranolaAutomationMatchesResult> {
    const limit = options.limit ?? 20;
    const matches = this.deps.automationMatchStore
      ? await this.deps.automationMatchStore.readMatches(limit)
      : this.#automationMatches.slice(-limit).reverse();
    this.setUiState({
      view: "idle",
    });
    return {
      matches: matches.map((match) => this.cloneAutomationMatch(match)),
    };
  }

  async loginAuth(
    options: { apiKey?: string; supabasePath?: string } = {},
  ): Promise<GranolaAppAuthState> {
    const controller = this.requireAuthController();

    try {
      const auth = await controller.login(options);
      return this.applyAuthState(auth, {
        resetDocuments: true,
        view: "auth",
      });
    } catch (error) {
      const auth = await controller.inspect();
      this.applyAuthState(auth, { view: "auth" });
      throw error;
    }
  }

  async logoutAuth(): Promise<GranolaAppAuthState> {
    const auth = await this.requireAuthController().logout();
    return this.applyAuthState(auth, {
      resetDocuments: true,
      view: "auth",
    });
  }

  async refreshAuth(): Promise<GranolaAppAuthState> {
    const controller = this.requireAuthController();

    try {
      const auth = await controller.refresh();
      return this.applyAuthState(auth, {
        resetDocuments: true,
        view: "auth",
      });
    } catch (error) {
      const auth = await controller.inspect();
      this.applyAuthState(auth, { view: "auth" });
      throw error;
    }
  }

  async switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState> {
    const controller = this.requireAuthController();

    try {
      const auth = await controller.switchMode(mode);
      return this.applyAuthState(auth, {
        resetDocuments: true,
        view: "auth",
      });
    } catch (error) {
      const auth = await controller.inspect();
      this.applyAuthState(auth, { view: "auth" });
      throw error;
    }
  }

  private async runSync(options: {
    forceRefresh?: boolean;
    foreground: boolean;
  }): Promise<GranolaAppSyncResult> {
    const previousMeetings = this.#meetingIndex.map((meeting) => cloneMeetingSummary(meeting));
    this.#state.sync = {
      ...this.#state.sync,
      lastError: undefined,
      lastStartedAt: this.nowIso(),
      running: true,
    };
    if (options.foreground) {
      this.setUiState({ view: "sync" });
    } else {
      this.emitStateUpdate();
    }

    try {
      const snapshot = await this.liveMeetingSnapshot({
        forceRefresh: options.forceRefresh ?? true,
      });
      await this.persistMeetingIndex(snapshot.meetings);
      const { changes, summary } = diffMeetingSummaries(
        previousMeetings,
        snapshot.meetings,
        snapshot.folders?.length ?? 0,
      );
      const completedAt = this.nowIso();
      const runId = this.createSyncRunId();
      const events = buildSyncEvents(
        runId,
        completedAt,
        changes,
        previousMeetings,
        snapshot.meetings,
      );
      if (events.length > 0 && this.deps.syncEventStore) {
        await this.deps.syncEventStore.appendEvents(events);
      }
      const rules = await this.loadAutomationRules();
      const automationMatches = matchAutomationRules(rules, events, completedAt);
      await this.appendAutomationMatches(automationMatches);
      this.#state.sync = {
        ...this.#state.sync,
        eventCount: this.#state.sync.eventCount + events.length,
        lastChanges: changes.slice(0, 50).map(cloneSyncChange),
        lastCompletedAt: completedAt,
        lastError: undefined,
        lastRunId: runId,
        running: false,
        summary: { ...summary },
      };
      await this.persistSyncState();
      this.emitStateUpdate();

      return {
        changes: changes.map(cloneSyncChange),
        state: cloneSyncState(this.#state.sync),
        summary: { ...summary },
      };
    } catch (error) {
      this.#state.sync = {
        ...this.#state.sync,
        lastError: error instanceof Error ? error.message : String(error),
        lastFailedAt: this.nowIso(),
        running: false,
      };
      await this.persistSyncState();
      this.emitStateUpdate();
      throw error;
    }
  }

  async sync(
    options: { forceRefresh?: boolean; foreground?: boolean } = {},
  ): Promise<GranolaAppSyncResult> {
    return await this.runSync({
      forceRefresh: options.forceRefresh,
      foreground: options.foreground ?? true,
    });
  }

  async listDocuments(options: { forceRefresh?: boolean } = {}): Promise<GranolaDocument[]> {
    if (options.forceRefresh) {
      this.resetDocumentsState();
      this.emitStateUpdate();
    }

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

  async loadCache(
    options: { forceRefresh?: boolean; required?: boolean } = {},
  ): Promise<CacheData | undefined> {
    if (options.forceRefresh) {
      this.resetCacheState();
      this.emitStateUpdate();
    }

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

  async listFolders(options: GranolaFolderListOptions = {}): Promise<GranolaFolderListResult> {
    const folders = await this.loadFolders({
      forceRefresh: options.forceRefresh,
      required: true,
    });
    const summaries = filterFolders(
      (folders ?? []).map((folder) => buildFolderSummary(folder)),
      {
        limit: options.limit,
        search: options.search,
      },
    );

    this.setUiState({
      folderSearch: options.search,
      selectedFolderId: undefined,
      view: "folder-list",
    });

    return {
      folders: summaries,
    };
  }

  async getFolder(id: string): Promise<FolderRecord> {
    const folders = await this.loadFolders({ required: true });
    const cacheData = await this.loadCache();
    const documents = await this.listDocuments();
    const summaries = (folders ?? []).map((folder) => buildFolderSummary(folder));
    const folder = resolveFolder(summaries, id);
    const rawFolder = (folders ?? []).find((candidate) => candidate.id === folder.id);
    if (!rawFolder) {
      throw new Error(`folder not found: ${id}`);
    }

    const meetings = listMeetings(documents, {
      cacheData,
      folderId: folder.id,
      foldersByDocumentId: this.buildFoldersByDocumentId(folders),
      limit: Math.max(rawFolder.documentIds.length, 1),
      sort: "updated-desc",
    });
    const record = buildFolderRecord(rawFolder, meetings);

    this.setUiState({
      selectedFolderId: folder.id,
      view: "folder-detail",
    });

    return record;
  }

  async findFolder(query: string): Promise<FolderRecord> {
    const folders = await this.loadFolders({ required: true });
    const summary = resolveFolderQuery(
      (folders ?? []).map((folder) => buildFolderSummary(folder)),
      query,
    );
    return await this.getFolder(summary.id);
  }

  async listMeetings(options: GranolaMeetingListOptions = {}): Promise<GranolaMeetingListResult> {
    const preferIndex =
      options.preferIndex ??
      (this.#state.ui.surface === "web" || this.#state.ui.surface === "server");

    if (!options.forceRefresh && preferIndex && !this.#documents && this.#meetingIndex.length > 0) {
      const meetings = filterMeetingSummaries(this.#meetingIndex, options);
      this.setUiState({
        folderSearch: undefined,
        meetingListSource: "index",
        meetingSearch: options.search,
        meetingSort: options.sort,
        meetingUpdatedFrom: options.updatedFrom,
        meetingUpdatedTo: options.updatedTo,
        selectedFolderId: options.folderId,
        selectedMeetingId: undefined,
        view: "meeting-list",
      });
      this.triggerMeetingIndexRefresh();
      return {
        meetings,
        source: "index",
      };
    }

    const snapshot = await this.liveMeetingSnapshot({
      forceRefresh: options.forceRefresh,
    });
    if (options.folderId && !snapshot.folders) {
      throw new Error("Granola folder API is not configured");
    }

    const meetings = listMeetings(snapshot.documents, {
      cacheData: snapshot.cacheData,
      folderId: options.folderId,
      foldersByDocumentId: this.buildFoldersByDocumentId(snapshot.folders),
      limit: options.limit,
      search: options.search,
      sort: options.sort,
      updatedFrom: options.updatedFrom,
      updatedTo: options.updatedTo,
    });

    await this.persistMeetingIndex(snapshot.meetings);

    this.setUiState({
      folderSearch: undefined,
      meetingListSource: "live",
      meetingSearch: options.search,
      meetingSort: options.sort,
      meetingUpdatedFrom: options.updatedFrom,
      meetingUpdatedTo: options.updatedTo,
      selectedFolderId: options.folderId,
      selectedMeetingId: undefined,
      view: "meeting-list",
    });

    return {
      meetings,
      source: "live",
    };
  }

  async getMeeting(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    const documents = await this.listDocuments();
    const cacheData = await this.loadCache({ required: options.requireCache });
    const folders = await this.loadFolders();
    const document = resolveMeeting(documents, id);
    const meeting = buildMeetingRecord(
      document,
      cacheData,
      this.buildFoldersByDocumentId(folders)?.get(document.id),
    );

    this.setUiState({
      selectedFolderId: meeting.meeting.folders[0]?.id,
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
    const folders = await this.loadFolders();
    const document = resolveMeetingQuery(documents, query);
    const meeting = buildMeetingRecord(
      document,
      cacheData,
      this.buildFoldersByDocumentId(folders)?.get(document.id),
    );

    this.setUiState({
      selectedFolderId: meeting.meeting.folders[0]?.id,
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

  async exportNotes(
    format: NoteOutputFormat = "markdown",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaNotesExportResult> {
    const documents = await this.listDocuments();
    const exportContext = await this.resolveExportContext(options.folderId);
    const filteredDocuments = exportContext.documentIds
      ? documents.filter((document) => exportContext.documentIds!.has(document.id))
      : documents;

    return await this.runNotesExport({
      documents: filteredDocuments,
      format,
      outputDir: resolveExportOutputDir(
        options.outputDir ?? this.config.notes.output,
        exportContext.scope,
        {
          scopedDirectory: options.scopedOutput,
        },
      ),
      scope: exportContext.scope,
    });
  }

  private async runNotesExport(options: {
    documents: GranolaDocument[];
    format: NoteOutputFormat;
    outputDir: string;
    scope: GranolaExportScope;
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

    this.#state.exports.notes = {
      format: options.format,
      itemCount: options.documents.length,
      jobId: job.id,
      outputDir: options.outputDir,
      ranAt: this.nowIso(),
      scope: cloneExportScope(options.scope),
      written,
    };
    this.emitStateUpdate();
    this.setUiState({
      selectedFolderId: options.scope.mode === "folder" ? options.scope.folderId : undefined,
      view: "notes-export",
    });

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

  async exportTranscripts(
    format: TranscriptOutputFormat = "text",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaTranscriptsExportResult> {
    const cacheData = await this.loadCache({ required: true });
    if (!cacheData) {
      throw this.missingCacheError();
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

    return await this.runTranscriptsExport({
      cacheData: scopedCacheData,
      format,
      outputDir: resolveExportOutputDir(
        options.outputDir ?? this.config.transcripts.output,
        exportContext.scope,
        {
          scopedDirectory: options.scopedOutput,
        },
      ),
      scope: exportContext.scope,
    });
  }

  private async runTranscriptsExport(options: {
    cacheData: CacheData;
    format: TranscriptOutputFormat;
    outputDir: string;
    scope: GranolaExportScope;
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

    this.#state.exports.transcripts = {
      format: options.format,
      itemCount: count,
      jobId: job.id,
      outputDir: options.outputDir,
      ranAt: this.nowIso(),
      scope: cloneExportScope(options.scope),
      written,
    };
    this.emitStateUpdate();
    this.setUiState({
      selectedFolderId: options.scope.mode === "folder" ? options.scope.folderId : undefined,
      view: "transcripts-export",
    });

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

  async rerunExportJob(
    id: string,
  ): Promise<GranolaNotesExportResult | GranolaTranscriptsExportResult> {
    const job = this.#state.exports.jobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`export job not found: ${id}`);
    }

    if (job.kind === "notes") {
      return await this.exportNotes(job.format as NoteOutputFormat, {
        folderId: job.scope.mode === "folder" ? job.scope.folderId : undefined,
        outputDir: job.outputDir,
        scopedOutput: false,
      });
    }

    return await this.exportTranscripts(job.format as TranscriptOutputFormat, {
      folderId: job.scope.mode === "folder" ? job.scope.folderId : undefined,
      outputDir: job.outputDir,
      scopedOutput: false,
    });
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

    const folders = await this.loadFolders({
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

export async function createGranolaApp(
  config: AppConfig,
  options: {
    logger?: Pick<Console, "warn">;
    now?: () => Date;
    surface?: GranolaAppSurface;
  } = {},
): Promise<GranolaApp> {
  const auth = await inspectDefaultGranolaAuth(config);
  const automationMatchStore = createDefaultAutomationMatchStore();
  const automationMatches = await automationMatchStore.readMatches(0);
  const automationRuleStore = createDefaultAutomationRuleStore(
    config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
  );
  const automationRules = await automationRuleStore.readRules();
  const authController = createDefaultGranolaAuthController(config);
  const exportJobStore = createDefaultExportJobStore();
  const exportJobs = await exportJobStore.readJobs();
  const meetingIndexStore = createDefaultMeetingIndexStore();
  const meetingIndex = await meetingIndexStore.readIndex();
  const syncEventStore = createDefaultSyncEventStore();
  const syncStateStore = createDefaultSyncStateStore();
  const syncState = await syncStateStore.readState();

  return new GranolaApp(
    config,
    {
      auth,
      authController,
      automationMatches,
      automationMatchStore,
      automationRules,
      automationRuleStore,
      cacheLoader: loadOptionalGranolaCache,
      createGranolaClient: async (mode) =>
        await createDefaultGranolaRuntime(config, options.logger, {
          preferredMode: mode,
        }),
      exportJobs,
      exportJobStore,
      meetingIndex,
      meetingIndexStore,
      now: options.now,
      syncEventStore,
      syncState,
      syncStateStore,
    },
    { surface: options.surface },
  );
}

export type { DefaultGranolaAuthInfo };
