import { type GranolaAgentHarness } from "../agent-harnesses.ts";
import { defaultAutomationArtefactsFilePath } from "../automation-artefacts.ts";
import { defaultAutomationMatchesFilePath } from "../automation-matches.ts";
import { defaultAutomationRunsFilePath } from "../automation-runs.ts";
import { defaultAutomationRulesFilePath } from "../automation-rules.ts";
import { type DefaultGranolaAuthInfo } from "../client/default.ts";
import { createExportJobId } from "../export-jobs.ts";
import type { GranolaFolder } from "../types.ts";
import { defaultMeetingIndexFilePath } from "../meeting-index.ts";
import {
  resolveGranolaIntelligencePreset,
  type GranolaIntelligencePreset,
} from "../intelligence-presets.ts";
import {
  applyPluginRuntimeDefaults,
  createDefaultPluginRegistry,
  defaultPluginEnabledMap,
  type GranolaPluginRegistry,
} from "../plugin-registry.ts";
import { defaultSyncEventsFilePath, defaultSyncStateFilePath } from "../sync-state.ts";
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
  GranolaAutomationRule,
  GranolaAutomationMatchesResult,
  GranolaAutomationRulesResult,
  GranolaAutomationRunsResult,
  GranolaAppAuthMode,
  GranolaAppAuthState,
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
import type { GranolaAppDependencies } from "./app-dependencies.ts";
import { loadDefaultGranolaAppDependencies } from "./app-bootstrap.ts";
import { cloneMeetingSummary, cloneState } from "./app-state.ts";
import { buildPluginState, buildPluginsState, isPluginCapabilityEnabled } from "./plugin-state.ts";
import { GranolaCatalogService, type GranolaCatalogLiveSnapshot } from "./catalog.ts";
import { GranolaAuthService } from "./auth-service.ts";
import { cloneGranolaExportJobState, GranolaExportService } from "./export-service.ts";
import { GranolaIndexService } from "./index-service.ts";
import { GranolaAutomationService } from "./automation-service.ts";
import { GranolaAutomationRuntime } from "./automation-runtime.ts";
import { cloneSyncState, GranolaSyncService } from "./sync-service.ts";
import { GranolaWorkspaceService } from "./workspace-service.ts";
import { GranolaYazdService } from "./yazd-service.ts";

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
  readonly #workspace: GranolaWorkspaceService;
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
    this.#workspace = new GranolaWorkspaceService({
      catalog: this.#catalog,
      emitStateUpdate: () => {
        this.emitStateUpdate();
      },
      index: this.#index,
      nowIso: () => this.nowIso(),
      state: this.#state,
      syncInBackground: async () => {
        await this.#sync.sync({ foreground: false });
      },
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
    return await this.#workspace.listFolders(options);
  }

  async getFolder(id: string): Promise<FolderRecord> {
    return await this.#workspace.getFolder(id);
  }

  async findFolder(query: string): Promise<FolderRecord> {
    return await this.#workspace.findFolder(query);
  }

  async listMeetings(options: GranolaMeetingListOptions = {}): Promise<GranolaMeetingListResult> {
    return await this.#workspace.listMeetings(options);
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
    return await this.#workspace.getMeeting(id, options);
  }

  async findMeeting(
    query: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    return await this.#workspace.findMeeting(query, options);
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
  const deps = await loadDefaultGranolaAppDependencies(config, options);

  return new GranolaApp(config, deps, { surface: options.surface });
}

export type { DefaultGranolaAuthInfo };
