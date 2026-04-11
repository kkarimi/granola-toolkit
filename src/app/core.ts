import {
  createDefaultAgentHarnessStore,
  type GranolaAgentHarness,
  type AgentHarnessStore,
} from "../agent-harnesses.ts";
import {
  createDefaultAutomationArtefactStore,
  defaultAutomationArtefactsFilePath,
  type AutomationArtefactStore,
} from "../automation-artefacts.ts";
import {
  createDefaultAutomationAgentRunner,
  type GranolaAutomationAgentRunner,
} from "../agents.ts";
import type { GranolaAgentProviderRegistry } from "../agent-provider-registry.ts";
import type { GranolaAutomationActionRegistry } from "../automation-action-registry.ts";
import {
  createDefaultAutomationMatchStore,
  defaultAutomationMatchesFilePath,
  type AutomationMatchStore,
} from "../automation-matches.ts";
import {
  createDefaultAutomationRunStore,
  defaultAutomationRunsFilePath,
  type AutomationRunStore,
} from "../automation-runs.ts";
import {
  createDefaultAutomationRuleStore,
  defaultAutomationRulesFilePath,
  type AutomationRuleStore,
} from "../automation-rules.ts";
import {
  createDefaultGranolaAuthController,
  createDefaultGranolaRuntime,
  inspectDefaultGranolaAuth,
  loadOptionalGranolaCache,
  type DefaultGranolaAuthController,
  type DefaultGranolaAuthInfo,
  type GranolaSyncAdapterRegistry,
} from "../client/default.ts";
import {
  createDefaultCatalogSnapshotStore,
  type CatalogSnapshotStore,
  type GranolaCatalogSnapshot,
} from "../catalog-snapshot.ts";
import {
  createDefaultExportJobStore,
  createExportJobId,
  type ExportJobStore,
} from "../export-jobs.ts";
import { createDefaultExportTargetStore, type ExportTargetStore } from "../export-targets.ts";
import { filterMeetingSummaries, listMeetings } from "../meetings.ts";
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
import { createDefaultPkmTargetStore, type PkmTargetStore } from "../pkm-targets.ts";
import {
  resolveGranolaIntelligencePreset,
  type GranolaIntelligencePreset,
} from "../intelligence-presets.ts";
import { createDefaultPluginSettingsStore, type PluginSettingsStore } from "../plugins.ts";
import { createGranEventHookRunner, type GranEventHookRunner } from "../event-hooks.ts";
import {
  applyPluginRuntimeDefaults,
  createDefaultPluginRegistry,
  defaultPluginEnabledMap,
  type GranolaPluginRegistry,
} from "../plugin-registry.ts";
import {
  defaultSyncEventsFilePath,
  createDefaultSyncStateStore,
  defaultSyncStateFilePath,
  type SyncStateStore,
} from "../sync-state.ts";
import { createDefaultSyncEventStore, type SyncEventStore } from "../sync-events.ts";
import {
  createDefaultSearchIndexStore,
  type GranolaSearchIndexEntry,
  type SearchIndexStore,
} from "../search-index.ts";
import {} from "../processing-health.ts";
import type {
  AppConfig,
  CacheData,
  GranolaDocument,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../types.ts";

import type {
  GranolaAppApi,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactPublishPreviewResult,
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactsResult,
  GranolaAutomationAgentAction,
  GranolaAutomationActionRun,
  GranolaAutomationArtefactListOptions,
  GranolaAutomationArtefactUpdate,
  GranolaAutomationEvaluationCase,
  GranolaAutomationEvaluationResult,
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaAutomationMatchesResult,
  GranolaAutomationRulesResult,
  GranolaAutomationRunsResult,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppPluginId,
  GranolaAppPluginState,
  GranolaAppPluginsResult,
  GranolaAgentHarnessesResult,
  GranolaAgentHarnessExplanationsResult,
  GranolaAppSyncEventsResult,
  GranolaAppSyncResult,
  GranolaAppSyncState,
  GranolaYazdArtifactBundle,
  GranolaYazdSourceChangesResult,
  GranolaYazdSourceFetchResult,
  GranolaYazdSourceInfo,
  GranolaYazdSourceListOptions,
  GranolaYazdSourceListResult,
  GranolaExportTarget,
  GranolaExportTargetsResult,
  GranolaExportRunOptions,
  GranolaExportJobsListOptions,
  GranolaExportJobsResult,
  GranolaAppStateEvent,
  GranolaAppState,
  GranolaAppSurface,
  GranolaFolderListOptions,
  GranolaFolderListResult,
  GranolaPkmTargetsResult,
  GranolaProcessingIssue,
  GranolaProcessingIssuesResult,
  GranolaProcessingIssueSeverity,
  GranolaProcessingRecoveryResult,
  GranolaMeetingBundle,
  GranolaMeetingListOptions,
  GranolaMeetingListResult,
  GranolaNotesExportResult,
  GranolaTranscriptsExportResult,
} from "./types.ts";
import type { FolderRecord, FolderSummaryRecord, MeetingSummaryRecord } from "./models.ts";
import {
  buildPluginState,
  buildPluginsState,
  clonePluginsState,
  isPluginCapabilityEnabled,
} from "./plugin-state.ts";
import {
  GranolaCatalogService,
  type GranolaCatalogClient,
  type GranolaCatalogLiveSnapshot,
} from "./catalog.ts";
import { GranolaAuthService } from "./auth-service.ts";
import {
  cloneGranolaExportJobState,
  cloneGranolaExportRunState,
  GranolaExportService,
} from "./export-service.ts";
import type { GranolaExporterRegistry } from "./export-registry.ts";
import { GranolaIndexService } from "./index-service.ts";
import { GranolaAutomationService } from "./automation-service.ts";
import { GranolaAutomationRuntime } from "./automation-runtime.ts";
import { cloneSyncState, GranolaSyncService } from "./sync-service.ts";
import { GranolaYazdService } from "./yazd-service.ts";

interface GranolaAppDependencies {
  agentHarnessStore?: AgentHarnessStore;
  agentProviderRegistry?: GranolaAgentProviderRegistry;
  agentRunner?: GranolaAutomationAgentRunner;
  auth: GranolaAppAuthState;
  authController?: DefaultGranolaAuthController;
  automationActionRegistry?: GranolaAutomationActionRegistry;
  automationArtefactStore?: AutomationArtefactStore;
  automationArtefacts?: GranolaAutomationArtefact[];
  automationMatchStore?: AutomationMatchStore;
  automationMatches?: GranolaAutomationMatch[];
  automationRunStore?: AutomationRunStore;
  automationRuns?: GranolaAutomationActionRun[];
  automationRuleStore?: AutomationRuleStore;
  automationRules?: GranolaAutomationRule[];
  catalogSnapshot?: GranolaCatalogSnapshot;
  catalogSnapshotStore?: CatalogSnapshotStore;
  cacheLoader: (cacheFile?: string) => Promise<CacheData | undefined>;
  createGranolaClient?: (mode?: GranolaAppAuthMode) => Promise<{
    auth: GranolaAppAuthState;
    client: GranolaCatalogClient;
  }>;
  exportJobStore?: ExportJobStore;
  exportTargetStore?: ExportTargetStore;
  exporterRegistry?: GranolaExporterRegistry;
  exportJobs?: GranolaAppExportJobState[];
  eventHookRunner?: GranEventHookRunner;
  granolaClient?: GranolaCatalogClient;
  logger?: Pick<Console, "warn">;
  meetingIndex?: MeetingSummaryRecord[];
  meetingIndexStore?: MeetingIndexStore;
  pkmTargetStore?: PkmTargetStore;
  pluginRegistry?: GranolaPluginRegistry;
  pluginSettingsStore?: PluginSettingsStore;
  now?: () => Date;
  searchIndex?: GranolaSearchIndexEntry[];
  searchIndexStore?: SearchIndexStore;
  syncAdapterRegistry?: GranolaSyncAdapterRegistry;
  syncEventStore?: SyncEventStore;
  syncState?: GranolaAppSyncState;
  syncStateStore?: SyncStateStore;
}

function cloneFolderSummary(folder: FolderSummaryRecord): FolderSummaryRecord {
  return { ...folder };
}

function deriveFolderSummariesFromMeetings(
  meetings: MeetingSummaryRecord[],
): FolderSummaryRecord[] {
  const foldersById = new Map<
    string,
    {
      folder: FolderSummaryRecord;
      meetingIds: Set<string>;
    }
  >();

  for (const meeting of meetings) {
    for (const folder of meeting.folders) {
      const existing = foldersById.get(folder.id);
      if (existing) {
        existing.meetingIds.add(meeting.id);
        existing.folder = {
          ...existing.folder,
          createdAt:
            existing.folder.createdAt.localeCompare(folder.createdAt) <= 0
              ? existing.folder.createdAt
              : folder.createdAt,
          description: existing.folder.description ?? folder.description,
          documentCount: Math.max(existing.folder.documentCount, folder.documentCount),
          isFavourite: existing.folder.isFavourite || folder.isFavourite,
          updatedAt:
            existing.folder.updatedAt.localeCompare(folder.updatedAt) >= 0
              ? existing.folder.updatedAt
              : folder.updatedAt,
          workspaceId: existing.folder.workspaceId ?? folder.workspaceId,
        };
        continue;
      }

      foldersById.set(folder.id, {
        folder: cloneFolderSummary(folder),
        meetingIds: new Set([meeting.id]),
      });
    }
  }

  return [...foldersById.values()]
    .map(({ folder, meetingIds }) => ({
      ...folder,
      documentCount: Math.max(folder.documentCount, meetingIds.size),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
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
      agents: state.config.agents ? { ...state.config.agents } : undefined,
      exports: state.config.exports ? { ...state.config.exports } : undefined,
      hooks: state.config.hooks
        ? {
            items: state.config.hooks.items.map((hook) => ({ ...hook })),
          }
        : undefined,
      notes: { ...state.config.notes },
      plugins: state.config.plugins ? { ...state.config.plugins } : undefined,
      transcripts: { ...state.config.transcripts },
    },
    documents: { ...state.documents },
    folders: { ...state.folders },
    exports: {
      jobs: state.exports.jobs.map((job) => cloneGranolaExportJobState(job)),
      notes: cloneGranolaExportRunState(state.exports.notes),
      transcripts: cloneGranolaExportRunState(state.exports.transcripts),
    },
    index: { ...state.index },
    plugins: clonePluginsState(state.plugins),
    sync: cloneSyncState(state.sync),
    ui: { ...state.ui },
  };
}

function defaultState(
  config: AppConfig,
  auth: GranolaAppAuthState,
  surface: GranolaAppSurface,
  pluginRegistry: GranolaPluginRegistry,
): GranolaAppState {
  const pluginDefinitions = pluginRegistry.listPlugins();
  const enabledPlugins = {
    ...defaultPluginEnabledMap(pluginDefinitions),
    ...config.plugins?.enabled,
  };

  return {
    auth: { ...auth },
    automation: {
      artefactCount: 0,
      artefactsFile: config.automation?.artefactsFile ?? defaultAutomationArtefactsFilePath(),
      loaded: false,
      matchCount: 0,
      matchesFile: defaultAutomationMatchesFilePath(),
      pendingArtefactCount: 0,
      pendingRunCount: 0,
      ruleCount: 0,
      rulesFile: config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
      runCount: 0,
      runsFile: defaultAutomationRunsFilePath(),
    },
    cache: {
      configured: Boolean(config.transcripts.cacheFile),
      documentCount: 0,
      filePath: config.transcripts.cacheFile || undefined,
      loaded: false,
      source: undefined,
      transcriptCount: 0,
    },
    config: {
      ...config,
      automation: config.automation ? { ...config.automation } : undefined,
      agents: config.agents ? { ...config.agents } : undefined,
      exports: config.exports ? { ...config.exports } : undefined,
      hooks: config.hooks
        ? {
            items: config.hooks.items.map((hook) => ({ ...hook })),
          }
        : undefined,
      notes: { ...config.notes },
      plugins: config.plugins ? { ...config.plugins } : undefined,
      transcripts: { ...config.transcripts },
    },
    documents: {
      count: 0,
      loaded: false,
      source: undefined,
    },
    folders: {
      count: 0,
      loaded: false,
      source: undefined,
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
    plugins: buildPluginsState(pluginDefinitions, enabledPlugins),
    sync: {
      eventCount: 0,
      eventsFile: defaultSyncEventsFilePath(),
      filePath: defaultSyncStateFilePath(),
      lastChanges: [],
      recentRuns: [],
      running: false,
    },
    ui: {
      surface,
    },
  };
}

export class GranolaApp implements GranolaAppApi {
  #automation: GranolaAutomationService;
  #auth: GranolaAuthService;
  #catalog: GranolaCatalogService;
  #exports: GranolaExportService;
  #index: GranolaIndexService;
  #listeners = new Set<(event: GranolaAppStateEvent) => void>();
  readonly #pluginRegistry: GranolaPluginRegistry;
  readonly #sync: GranolaSyncService;
  readonly #state: GranolaAppState;
  readonly #yazd: GranolaYazdService;

  constructor(
    readonly config: AppConfig,
    private readonly deps: GranolaAppDependencies,
    options: { surface?: GranolaAppSurface } = {},
  ) {
    this.#pluginRegistry = deps.pluginRegistry ?? createDefaultPluginRegistry();
    const configuredPlugins = applyPluginRuntimeDefaults({
      enabled: {
        ...config.plugins?.enabled,
      },
      signals: {
        automationRuntimeAvailable: Boolean(
          deps.automationArtefacts?.length ||
          deps.automationMatches?.length ||
          deps.automationRules?.length ||
          deps.automationRuns?.length,
        ),
      },
      sources: config.plugins?.sources,
    });
    this.#state = defaultState(
      {
        ...config,
        plugins: {
          enabled: {
            ...configuredPlugins.enabled,
          },
          sources: configuredPlugins.sources,
          settingsFile: config.plugins?.settingsFile ?? "",
        },
      },
      deps.auth,
      options.surface ?? "cli",
      this.#pluginRegistry,
    );
    const createGranolaClient =
      deps.createGranolaClient ??
      (deps.syncAdapterRegistry
        ? async (mode?: GranolaAppAuthMode) =>
            await deps
              .syncAdapterRegistry!.resolve("granola", "sync adapter")
              .createRuntime({ preferredMode: mode })
        : undefined);
    this.#auth = new GranolaAuthService({
      authController: deps.authController,
      emitStateUpdate: () => {
        this.emitStateUpdate();
      },
      resetRemoteState: () => {
        this.resetRemoteState();
      },
      state: this.#state,
    });
    this.#catalog = new GranolaCatalogService(config, {
      cacheLoader: deps.cacheLoader,
      createGranolaClient,
      initialSnapshot: deps.catalogSnapshot,
      getAuthMode: () => this.#state.auth.mode,
      granolaClient: deps.granolaClient,
      nowIso: () => this.nowIso(),
      onAuthState: (auth) => {
        this.#state.auth = { ...auth };
        this.emitStateUpdate();
      },
      onCacheState: (state) => {
        this.#state.cache = { ...state };
        this.emitStateUpdate();
      },
      onDocumentsState: (state) => {
        this.#state.documents = { ...state };
        this.emitStateUpdate();
      },
      onFoldersState: (state) => {
        this.#state.folders = { ...state };
        this.emitStateUpdate();
      },
      snapshotStore: deps.catalogSnapshotStore,
    });
    this.#state.exports.jobs = (deps.exportJobs ?? []).map((job) =>
      cloneGranolaExportJobState(job),
    );
    this.#index = new GranolaIndexService({
      emitStateUpdate: () => {
        this.emitStateUpdate();
      },
      meetingIndex: deps.meetingIndex,
      meetingIndexStore: deps.meetingIndexStore,
      nowIso: () => this.nowIso(),
      searchIndex: deps.searchIndex,
      searchIndexStore: deps.searchIndexStore,
      state: this.#state.index,
    });
    this.#exports = new GranolaExportService({
      config,
      createExportJobId,
      emitStateUpdate: () => {
        this.emitStateUpdate();
      },
      exporterRegistry: deps.exporterRegistry,
      exportJobStore: deps.exportJobStore,
      exportTargetStore: deps.exportTargetStore,
      loadCache: async (options = {}) => await this.loadCache(options),
      loadFolders: async (options = {}) => await this.loadFolders(options),
      listDocuments: async () => await this.listDocuments(),
      nowIso: () => this.nowIso(),
      state: this.#state.exports,
    });
    const automationRuntime = new GranolaAutomationRuntime({
      config,
      maybeReadMeetingBundleById: async (id, options) =>
        await this.maybeReadMeetingBundleById(id, options),
      nowIso: () => this.nowIso(),
      readMeetingBundleById: async (id, options) => await this.readMeetingBundleById(id, options),
      runNotesExport: async (options) => await this.#exports.runNotesExport(options),
      runPkmSync: async (meetingId, action, artefact) =>
        await this.#yazd.runAutomationPkmSync(meetingId, action, artefact),
      runTranscriptsExport: async (options) => await this.#exports.runTranscriptsExport(options),
      state: this.#state,
    });
    this.#automation = new GranolaAutomationService({
      agentHarnessStore: deps.agentHarnessStore,
      agentProviderRegistry: deps.agentProviderRegistry,
      agentRunner: deps.agentRunner,
      automationActionRegistry: deps.automationActionRegistry,
      automationArtefactStore: deps.automationArtefactStore,
      automationArtefacts: deps.automationArtefacts,
      automationMatchStore: deps.automationMatchStore,
      automationMatches: deps.automationMatches,
      automationRunStore: deps.automationRunStore,
      automationRuns: deps.automationRuns,
      automationRuleStore: deps.automationRuleStore,
      automationRules: deps.automationRules,
      config,
      currentMeetingSummaries: async () => await this.currentMeetingSummariesForProcessing(),
      emitStateUpdate: () => {
        this.emitStateUpdate();
      },
      handlers: automationRuntime.handlers(),
      maybeReadMeetingBundleById: async (id, options) =>
        await this.maybeReadMeetingBundleById(id, options),
      nowIso: () => this.nowIso(),
      onArtefactsChanged: async (artefacts) => {
        await this.#index.mergeArtefacts(artefacts);
      },
      readMeetingBundleById: async (id, options) => await this.readMeetingBundleById(id, options),
      state: this.#state,
    });
    this.#sync = new GranolaSyncService({
      automationPluginEnabled: () => this.automationPluginEnabled(),
      buildFoldersByDocumentId: (folders) => this.buildFoldersByDocumentId(folders),
      emitStateUpdate: () => {
        this.emitStateUpdate();
      },
      eventHookRunner: deps.eventHookRunner,
      getAutomationArtefacts: () => this.#automation.artefacts(),
      indexMeetings: () => this.#index.meetings(),
      liveMeetingSnapshot: async (options) => await this.liveMeetingSnapshot(options),
      logger: deps.logger,
      nowIso: () => this.nowIso(),
      persistMeetingIndex: async (meetings) => await this.#index.persistMeetingIndex(meetings),
      persistSearchIndex: async (entries) => await this.#index.persistSearchIndex(entries),
      processSyncEvents: async (events, matchedAt) =>
        await this.#automation.processSyncEvents(events, matchedAt),
      state: this.#state.sync,
      syncEventStore: deps.syncEventStore,
      syncStateStore: deps.syncStateStore,
    });
    this.#yazd = new GranolaYazdService({
      automationActionRegistry: deps.automationActionRegistry,
      getAutomationArtefact: async (id) => await this.#automation.getAutomationArtefact(id),
      listAutomationRules: async () => await this.#automation.listAutomationRules(),
      listMeetings: async (options) => await this.listMeetings(options),
      listSyncEvents: async (options) => await this.listSyncEvents(options),
      pkmTargetStore: deps.pkmTargetStore,
      readMeetingBundleById: async (id, options) => await this.readMeetingBundleById(id, options),
    });
    this.#state.index.filePath = defaultMeetingIndexFilePath();
    Object.assign(
      this.#state.sync,
      cloneSyncState(
        deps.syncState ?? {
          eventCount: 0,
          eventsFile: defaultSyncEventsFilePath(),
          filePath: defaultSyncStateFilePath(),
          lastChanges: [],
          recentRuns: [],
          running: false,
        },
      ),
    );
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

  private resetRemoteState(): void {
    this.#catalog.resetRemoteState();
  }

  private resetDocumentsState(): void {
    this.#catalog.resetDocumentsState();
  }

  private resetFoldersState(): void {
    this.#catalog.resetFoldersState();
  }

  private resetCacheState(): void {
    this.#catalog.resetCacheState();
  }

  private automationPluginEnabled(): boolean {
    return isPluginCapabilityEnabled(this.#state.plugins, "automation");
  }

  private assertAutomationPluginEnabled(): void {
    if (!this.automationPluginEnabled()) {
      throw new Error("automation plugin is disabled. Enable it in Settings -> Advanced first.");
    }
  }

  private async currentMeetingSummariesForProcessing(): Promise<MeetingSummaryRecord[]> {
    if (this.#index.hasMeetings()) {
      return this.#index.meetings();
    }

    const snapshot = await this.liveMeetingSnapshot({
      forceRefresh: false,
    });
    return snapshot.meetings.map((meeting) => cloneMeetingSummary(meeting));
  }

  private async liveMeetingSnapshot(
    options: { forceRefresh?: boolean } = {},
  ): Promise<GranolaCatalogLiveSnapshot> {
    return await this.#catalog.liveMeetingSnapshot(options);
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

  private buildFoldersByDocumentId(
    folders: GranolaFolder[] | undefined,
  ): Map<string, FolderSummaryRecord[]> | undefined {
    return this.#catalog.buildFoldersByDocumentId(folders);
  }

  async loadFolders(
    options: {
      forceRefresh?: boolean;
      required?: boolean;
    } = {},
  ): Promise<GranolaFolder[] | undefined> {
    return await this.#catalog.loadFolders(options);
  }

  async inspectAuth(): Promise<GranolaAppAuthState> {
    return await this.#auth.inspectAuth();
  }

  async inspectYazdSource(): Promise<GranolaYazdSourceInfo> {
    return await this.#yazd.inspectSource();
  }

  async listYazdSourceItems(
    options: GranolaYazdSourceListOptions = {},
  ): Promise<GranolaYazdSourceListResult> {
    return await this.#yazd.listSourceItems(options);
  }

  async fetchYazdSourceItem(id: string): Promise<GranolaYazdSourceFetchResult> {
    return await this.#yazd.fetchSourceItem(id);
  }

  async buildYazdSourceArtifacts(id: string): Promise<GranolaYazdArtifactBundle> {
    return await this.#yazd.buildSourceArtifacts(id);
  }

  async listYazdSourceChanges(
    options: { cursor?: string; limit?: number; since?: string } = {},
  ): Promise<GranolaYazdSourceChangesResult> {
    return await this.#yazd.listSourceChanges(options);
  }

  async listPlugins(): Promise<GranolaAppPluginsResult> {
    return {
      plugins: this.#state.plugins.items.map((plugin) => ({ ...plugin })),
    };
  }

  async setPluginEnabled(id: GranolaAppPluginId, enabled: boolean): Promise<GranolaAppPluginState> {
    const definition = this.#pluginRegistry.getPlugin(id);
    if (!definition) {
      throw new Error(`plugin not found: ${id}`);
    }

    const nextPlugin = buildPluginState(definition, enabled);
    this.#state.plugins = {
      items: this.#state.plugins.items.map((plugin) =>
        plugin.id === id ? nextPlugin : { ...plugin },
      ),
      loaded: true,
    };
    this.#state.config = {
      ...this.#state.config,
      plugins: {
        enabled: Object.fromEntries(
          this.#state.plugins.items.map((plugin) => [plugin.id, plugin.enabled]),
        ),
        sources: {
          ...this.#state.config.plugins?.sources,
          [id]: "persisted",
        },
        settingsFile:
          this.#state.config.plugins?.settingsFile ?? this.config.plugins?.settingsFile ?? "",
      },
    };

    if (this.deps.pluginSettingsStore) {
      await this.deps.pluginSettingsStore.writeSettings({
        enabled: Object.fromEntries(
          this.#state.plugins.items.map((plugin) => [plugin.id, plugin.enabled]),
        ),
      });
    }

    this.emitStateUpdate();
    return { ...nextPlugin };
  }

  async inspectSync(): Promise<GranolaAppSyncState> {
    return await this.#sync.inspectSync();
  }

  async listSyncEvents(options: { limit?: number } = {}): Promise<GranolaAppSyncEventsResult> {
    return await this.#sync.listSyncEvents(options);
  }

  async listAutomationArtefacts(
    options: GranolaAutomationArtefactListOptions = {},
  ): Promise<GranolaAutomationArtefactsResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.listAutomationArtefacts(options);
  }

  async listAgentHarnesses(): Promise<GranolaAgentHarnessesResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.listAgentHarnesses();
  }

  async saveAgentHarnesses(harnesses: GranolaAgentHarness[]): Promise<GranolaAgentHarnessesResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.saveAgentHarnesses(harnesses);
  }

  async explainAgentHarnesses(meetingId: string): Promise<GranolaAgentHarnessExplanationsResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.explainAgentHarnesses(meetingId);
  }

  async evaluateAutomationCases(
    cases: GranolaAutomationEvaluationCase[],
    options: {
      dryRun?: boolean;
      harnessIds?: string[];
      kind?: GranolaAutomationArtefactKind;
      model?: string;
      provider?: GranolaAutomationAgentAction["provider"];
    } = {},
  ): Promise<GranolaAutomationEvaluationResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.evaluateAutomationCases(cases, options);
  }

  async getAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.getAutomationArtefact(id);
  }

  async listPkmTargets(): Promise<GranolaPkmTargetsResult> {
    this.assertAutomationPluginEnabled();
    return await this.#yazd.listKnowledgeBases();
  }

  async previewAutomationArtefactPublish(
    id: string,
    options: { targetId?: string } = {},
  ): Promise<GranolaAutomationArtefactPublishPreviewResult> {
    this.assertAutomationPluginEnabled();
    return await this.#yazd.previewAutomationArtefactPublish(id, options);
  }

  async listProcessingIssues(
    options: {
      limit?: number;
      meetingId?: string;
      severity?: GranolaProcessingIssueSeverity;
    } = {},
  ): Promise<GranolaProcessingIssuesResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.listProcessingIssues(options);
  }

  async listAutomationRules(): Promise<GranolaAutomationRulesResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.listAutomationRules();
  }

  async saveAutomationRules(rules: GranolaAutomationRule[]): Promise<GranolaAutomationRulesResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.saveAutomationRules(rules);
  }

  async listAutomationMatches(
    options: { limit?: number } = {},
  ): Promise<GranolaAutomationMatchesResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.listAutomationMatches(options);
  }

  async listAutomationRuns(
    options: { limit?: number; status?: GranolaAutomationActionRun["status"] } = {},
  ): Promise<GranolaAutomationRunsResult> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.listAutomationRuns(options);
  }

  async resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string } = {},
  ): Promise<GranolaAutomationActionRun> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.resolveAutomationRun(id, decision, options);
  }

  async resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string; targetId?: string } = {},
  ): Promise<GranolaAutomationArtefact> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.resolveAutomationArtefact(id, decision, options);
  }

  async updateAutomationArtefact(
    id: string,
    patch: GranolaAutomationArtefactUpdate,
  ): Promise<GranolaAutomationArtefact> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.updateAutomationArtefact(id, patch);
  }

  async recoverProcessingIssue(id: string): Promise<GranolaProcessingRecoveryResult> {
    this.assertAutomationPluginEnabled();
    const knownIssue = (await this.#automation.listProcessingIssues({ limit: 1000 })).issues.find(
      (candidate) => candidate.id === id,
    );

    if (id.startsWith("sync-stale:")) {
      await this.sync({
        forceRefresh: true,
        foreground: false,
      });
      return {
        issue:
          knownIssue ??
          ({
            detail: "Sync completed.",
            detectedAt: this.nowIso(),
            id,
            kind: "sync-stale",
            recoverable: true,
            severity: "warning",
            title: "Sync completed",
          } satisfies GranolaProcessingIssue),
        recoveredAt: this.nowIso(),
        runCount: 0,
        syncRan: true,
      };
    }

    if (id.startsWith("transcript-missing:")) {
      await this.sync({
        forceRefresh: true,
        foreground: false,
      });
    }

    return await this.#automation.recoverProcessingIssue(id);
  }

  async rerunAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    this.assertAutomationPluginEnabled();
    return await this.#automation.rerunAutomationArtefact(id);
  }

  async loginAuth(
    options: { apiKey?: string; supabasePath?: string } = {},
  ): Promise<GranolaAppAuthState> {
    return await this.#auth.loginAuth(options);
  }

  async clearApiKeyAuth(): Promise<GranolaAppAuthState> {
    return await this.#auth.clearApiKeyAuth();
  }

  async logoutAuth(): Promise<GranolaAppAuthState> {
    return await this.#auth.logoutAuth();
  }

  async refreshAuth(): Promise<GranolaAppAuthState> {
    return await this.#auth.refreshAuth();
  }

  async switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState> {
    return await this.#auth.switchAuthMode(mode);
  }

  private async maybeReadMeetingBundleById(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle | undefined> {
    return await this.#catalog.maybeReadMeetingBundleById(id, options);
  }

  async sync(
    options: { forceRefresh?: boolean; foreground?: boolean } = {},
  ): Promise<GranolaAppSyncResult> {
    return await this.#sync.sync(options);
  }

  async listDocuments(options: { forceRefresh?: boolean } = {}): Promise<GranolaDocument[]> {
    return await this.#catalog.listDocuments(options);
  }

  async loadCache(
    options: { forceRefresh?: boolean; required?: boolean } = {},
  ): Promise<CacheData | undefined> {
    return await this.#catalog.loadCache(options);
  }

  async listFolders(options: GranolaFolderListOptions = {}): Promise<GranolaFolderListResult> {
    if (!options.forceRefresh && this.#index.hasMeetings()) {
      const summaries = filterFolders(deriveFolderSummariesFromMeetings(this.#index.meetings()), {
        limit: options.limit,
        search: options.search,
      });

      if (summaries.length > 0) {
        this.#state.folders = {
          count: summaries.length,
          loaded: true,
          loadedAt: this.nowIso(),
          source: "index",
        };
        this.emitStateUpdate();
        return {
          folders: summaries,
        };
      }
    }

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
    const canUseSearchIndex =
      Boolean(options.search?.trim()) && !options.forceRefresh && this.#index.hasSearchIndex();

    if (
      !options.forceRefresh &&
      preferIndex &&
      this.#index.hasMeetings() &&
      (canUseSearchIndex || !this.#state.documents.loaded)
    ) {
      const meetings = canUseSearchIndex
        ? this.#index.indexedMeetingsForSearch({
            folderId: options.folderId,
            limit: options.limit,
            search: options.search!,
            sort: options.sort,
            updatedFrom: options.updatedFrom,
            updatedTo: options.updatedTo,
          })
        : filterMeetingSummaries(this.#index.meetings(), options);
      if (!(options.folderId && meetings.length === 0)) {
        this.#index.triggerBackgroundRefresh(async () => {
          try {
            await this.#sync.sync({ foreground: false });
          } catch {
            // Opportunistic background sync should not break the foreground view.
          }
        });
        return {
          meetings,
          source: "index",
        };
      }
    }

    const snapshot = await this.liveMeetingSnapshot({
      forceRefresh: options.forceRefresh,
    });
    if (options.folderId && !snapshot.folders) {
      throw new Error("Gran folder API is not configured");
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

    await this.#index.persistMeetingIndex(snapshot.meetings);

    return {
      meetings,
      source: this.#state.documents.source === "snapshot" ? "snapshot" : "live",
    };
  }

  private async readMeetingBundleById(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    return await this.#catalog.readMeetingBundleById(id, options);
  }

  private async readMeetingBundleByQuery(
    query: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    return await this.#catalog.readMeetingBundleByQuery(query, options);
  }

  async getMeeting(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    return await this.readMeetingBundleById(id, options);
  }

  async findMeeting(
    query: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    let bundle: GranolaMeetingBundle;
    try {
      bundle = await this.readMeetingBundleByQuery(query, options);
    } catch (error) {
      const fallbackId = this.#index.searchFallbackMeetingId(query);
      if (!fallbackId) {
        throw error;
      }

      bundle = await this.readMeetingBundleById(fallbackId, options);
    }

    return bundle;
  }

  async runIntelligencePreset(
    presetId: string,
    options: {
      approvalMode?: "auto" | "manual";
      folderId?: string;
      limit?: number;
      model?: string;
      provider?: "codex" | "openai" | "openrouter";
      updatedFrom?: string;
    } = {},
  ): Promise<{
    artefacts: GranolaAutomationArtefact[];
    meetings: MeetingSummaryRecord[];
    preset: GranolaIntelligencePreset;
    runs: GranolaAutomationActionRun[];
  }> {
    const preset = resolveGranolaIntelligencePreset(presetId);
    if (!preset) {
      throw new Error(`intelligence preset not found: ${presetId}`);
    }

    const meetingResult = await this.listMeetings({
      folderId: options.folderId,
      limit: options.limit,
      preferIndex: true,
      sort: "updated-desc",
      updatedFrom: options.updatedFrom,
    });
    const meetings = meetingResult.meetings;
    const bundles: GranolaMeetingBundle[] = [];

    for (const meeting of meetings) {
      const bundle = await this.getMeeting(meeting.id, {
        requireCache: true,
      }).catch(async () => await this.getMeeting(meeting.id));
      bundles.push(bundle);
    }

    const result = await this.#automation.runIntelligencePreset({
      approvalMode: options.approvalMode,
      bundles,
      model: options.model,
      preset,
      provider: options.provider,
    });

    return {
      artefacts: result.artefacts,
      meetings,
      preset,
      runs: result.runs,
    };
  }

  async listExportJobs(
    options: GranolaExportJobsListOptions = {},
  ): Promise<GranolaExportJobsResult> {
    return await this.#exports.listJobs(options);
  }

  async listExportTargets(): Promise<GranolaExportTargetsResult> {
    return await this.#exports.listTargets();
  }

  async saveExportTargets(targets: GranolaExportTarget[]): Promise<GranolaExportTargetsResult> {
    return await this.#exports.saveTargets(targets);
  }

  async exportNotes(
    format: NoteOutputFormat = "markdown",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaNotesExportResult> {
    return await this.#exports.exportNotes(format, options);
  }

  async exportTranscripts(
    format: TranscriptOutputFormat = "text",
    options: GranolaExportRunOptions = {},
  ): Promise<GranolaTranscriptsExportResult> {
    return await this.#exports.exportTranscripts(format, options);
  }

  async rerunExportJob(
    id: string,
  ): Promise<GranolaNotesExportResult | GranolaTranscriptsExportResult> {
    return await this.#exports.rerunJob(id);
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
  const catalogSnapshotStore = createDefaultCatalogSnapshotStore();
  const catalogSnapshot = await catalogSnapshotStore.readSnapshot();
  const automationArtefactStore = createDefaultAutomationArtefactStore(
    config.automation?.artefactsFile,
  );
  const automationArtefacts = await automationArtefactStore.readArtefacts({ limit: 0 });
  const automationMatchStore = createDefaultAutomationMatchStore();
  const automationMatches = await automationMatchStore.readMatches(0);
  const automationRunStore = createDefaultAutomationRunStore();
  const automationRuns = await automationRunStore.readRuns({ limit: 0 });
  const automationRuleStore = createDefaultAutomationRuleStore(
    config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
  );
  const automationRules = await automationRuleStore.readRules();
  const agentHarnessStore = createDefaultAgentHarnessStore(config.agents?.harnessesFile);
  const authController = createDefaultGranolaAuthController(config);
  const exportJobStore = createDefaultExportJobStore();
  const exportJobs = await exportJobStore.readJobs();
  const exportTargetStore = createDefaultExportTargetStore(config.exports?.targetsFile);
  const meetingIndexStore = createDefaultMeetingIndexStore();
  const meetingIndex = await meetingIndexStore.readIndex();
  const pkmTargetStore = createDefaultPkmTargetStore(config.automation?.pkmTargetsFile);
  const pluginRegistry = createDefaultPluginRegistry();
  const pluginSettingsStore = createDefaultPluginSettingsStore(
    config.plugins?.settingsFile,
    pluginRegistry.listPlugins(),
  );
  const eventHookRunner = createGranEventHookRunner({
    hooks: config.hooks?.items ?? [],
    logger: options.logger,
  });
  const searchIndexStore = createDefaultSearchIndexStore();
  const searchIndex = await searchIndexStore.readIndex();
  const syncEventStore = createDefaultSyncEventStore();
  const syncStateStore = createDefaultSyncStateStore();
  const syncState = await syncStateStore.readState();

  return new GranolaApp(
    config,
    {
      auth,
      agentRunner: createDefaultAutomationAgentRunner(config),
      agentHarnessStore,
      authController,
      automationArtefactStore,
      automationArtefacts,
      automationMatches,
      automationMatchStore,
      automationRunStore,
      automationRuns,
      automationRules,
      automationRuleStore,
      catalogSnapshot,
      catalogSnapshotStore,
      cacheLoader: loadOptionalGranolaCache,
      createGranolaClient: async (mode) =>
        await createDefaultGranolaRuntime(config, options.logger, {
          preferredMode: mode,
        }),
      exportJobs,
      exportJobStore,
      exportTargetStore,
      eventHookRunner,
      meetingIndex,
      meetingIndexStore,
      logger: options.logger,
      now: options.now,
      pkmTargetStore,
      pluginRegistry,
      pluginSettingsStore,
      searchIndex,
      searchIndexStore,
      syncEventStore,
      syncState,
      syncStateStore,
    },
    { surface: options.surface },
  );
}

export type { DefaultGranolaAuthInfo };
