import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";

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
import { automationActionName, type AutomationActionContext } from "../automation-actions.ts";
import type { GranolaAutomationActionRegistry } from "../automation-action-registry.ts";
import {
  buildAutomationDeliveryPayload,
  renderSlackMessageText,
  renderWebhookBody,
  renderWriteFileContent,
  resolveWriteFilePath,
} from "../automation-delivery.ts";
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
  createDefaultExportJobStore,
  createExportJobId,
  type ExportJobStore,
} from "../export-jobs.ts";
import { meetingExportScope, resolveExportOutputDir } from "../export-scope.ts";
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
import { createDefaultPluginSettingsStore, type PluginSettingsStore } from "../plugins.ts";
import {
  defaultSyncEventsFilePath,
  createDefaultSyncStateStore,
  defaultSyncStateFilePath,
  type SyncStateStore,
} from "../sync-state.ts";
import { createDefaultSyncEventStore, type SyncEventStore } from "../sync-events.ts";
import { buildSyncEvents, diffMeetingSummaries } from "../sync.ts";
import {
  buildSearchIndex,
  createDefaultSearchIndexStore,
  type GranolaSearchIndexEntry,
  type SearchIndexStore,
} from "../search-index.ts";
import {} from "../processing-health.ts";
import { buildPipelineInstructions } from "../processing.ts";
import type {
  AppConfig,
  CacheData,
  GranolaDocument,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../types.ts";
import { quoteYamlString, sanitiseFilename, writeTextFile } from "../utils.ts";

import type {
  GranolaAppApi,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactsResult,
  GranolaAutomationCommandAction,
  GranolaAutomationAgentAction,
  GranolaAutomationExportNotesAction,
  GranolaAutomationExportTranscriptAction,
  GranolaAutomationPkmSyncAction,
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
  GranolaAutomationSlackMessageAction,
  GranolaAutomationWebhookAction,
  GranolaAutomationWriteFileAction,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppPluginId,
  GranolaAppPluginState,
  GranolaAppPluginsResult,
  GranolaAgentHarnessesResult,
  GranolaAgentHarnessExplanationsResult,
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
  GranolaPkmTarget,
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
import { scopedCacheDataForMeeting } from "./meeting-read-model.ts";

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
  cacheLoader: (cacheFile?: string) => Promise<CacheData | undefined>;
  createGranolaClient?: (mode?: GranolaAppAuthMode) => Promise<{
    auth: GranolaAppAuthState;
    client: GranolaCatalogClient;
  }>;
  exportJobStore?: ExportJobStore;
  exporterRegistry?: GranolaExporterRegistry;
  exportJobs?: GranolaAppExportJobState[];
  granolaClient?: GranolaCatalogClient;
  meetingIndex?: MeetingSummaryRecord[];
  meetingIndexStore?: MeetingIndexStore;
  pkmTargetStore?: PkmTargetStore;
  pluginSettingsStore?: PluginSettingsStore;
  now?: () => Date;
  searchIndex?: GranolaSearchIndexEntry[];
  searchIndexStore?: SearchIndexStore;
  syncAdapterRegistry?: GranolaSyncAdapterRegistry;
  syncEventStore?: SyncEventStore;
  syncState?: GranolaAppSyncState;
  syncStateStore?: SyncStateStore;
}

interface ResolvedAutomationAgentAttempt {
  harness?: GranolaAgentHarness;
  prompt: string;
  request: import("../agents.ts").GranolaAutomationAgentRequest;
  systemPrompt?: string;
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

function clonePluginState(plugin: GranolaAppPluginState): GranolaAppPluginState {
  return { ...plugin };
}

function defaultAutomationPluginState(enabled: boolean): GranolaAppPluginState {
  return {
    configurable: true,
    description:
      "Generate reviewable notes and enrichments, run harnesses, and process post-meeting automations.",
    enabled,
    id: "automation",
    label: "Automation",
    shipped: true,
  };
}

function resolveActionFilePath(filePath: string, cwd?: string): string {
  return cwd ? resolvePath(cwd, filePath) : resolvePath(filePath);
}

async function readOptionalActionFile(
  filePath?: string,
  cwd?: string,
): Promise<string | undefined> {
  if (!filePath) {
    return undefined;
  }

  return await readFile(resolveActionFilePath(filePath, cwd), "utf8");
}

function combinePromptSections(...values: Array<string | undefined>): string | undefined {
  const sections = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

function meetingTranscriptText(bundle: GranolaMeetingBundle): string | undefined {
  const segments = bundle.meeting.transcript?.segments;
  if (!segments?.length) {
    return undefined;
  }

  return segments
    .slice()
    .sort((left, right) => left.startTimestamp.localeCompare(right.startTimestamp))
    .map((segment) => `${segment.speaker}: ${segment.text.trim()}`)
    .filter(Boolean)
    .join("\n");
}

function buildAutomationAgentPrompt(
  match: GranolaAutomationMatch,
  rule: GranolaAutomationRule,
  instructions: string,
  bundle?: GranolaMeetingBundle,
): string {
  const transcriptText = bundle ? meetingTranscriptText(bundle)?.trim() : undefined;
  const document = bundle?.source.document;
  const context = {
    event: {
      id: match.eventId,
      kind: match.eventKind,
      matchedAt: match.matchedAt,
      meetingId: match.meetingId,
      transcriptLoaded: match.transcriptLoaded,
    },
    folders: match.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
    })),
    meeting: bundle
      ? {
          id: document!.id,
          notesPlain: document!.notesPlain,
          roleHelpers: bundle.meeting.roleHelpers,
          tags: [...document!.tags],
          title: document!.title,
          updatedAt: document!.updatedAt,
        }
      : {
          id: match.meetingId,
          tags: [...match.tags],
          title: match.title,
        },
    rule: {
      id: rule.id,
      name: rule.name,
    },
  };

  return [
    instructions.trim(),
    "Meeting context (JSON):",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
    document?.notesPlain?.trim() ? `Existing notes:\n${document.notesPlain.trim()}` : "",
    transcriptText ? `Transcript:\n${transcriptText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
      notes: { ...state.config.notes },
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
    plugins: {
      automation: clonePluginState(state.plugins.automation),
      loaded: state.plugins.loaded,
    },
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
      transcriptCount: 0,
    },
    config: {
      ...config,
      automation: config.automation ? { ...config.automation } : undefined,
      agents: config.agents ? { ...config.agents } : undefined,
      notes: { ...config.notes },
      plugins: config.plugins ? { ...config.plugins } : undefined,
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
    plugins: {
      automation: defaultAutomationPluginState(config.plugins?.automationEnabled === true),
      loaded: true,
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
  readonly #state: GranolaAppState;

  constructor(
    readonly config: AppConfig,
    private readonly deps: GranolaAppDependencies,
    options: { surface?: GranolaAppSurface } = {},
  ) {
    const automationPluginEnabled =
      config.plugins?.automationEnabled ??
      Boolean(
        deps.agentHarnessStore ||
        deps.agentRunner ||
        deps.automationArtefactStore ||
        deps.automationMatchStore ||
        deps.automationRunStore ||
        deps.automationRuleStore ||
        deps.automationArtefacts?.length ||
        deps.automationMatches?.length ||
        deps.automationRules?.length ||
        deps.automationRuns?.length,
      );
    this.#state = defaultState(
      {
        ...config,
        plugins: {
          automationEnabled: automationPluginEnabled,
          settingsFile: config.plugins?.settingsFile ?? "",
        },
      },
      deps.auth,
      options.surface ?? "cli",
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
      loadCache: async (options = {}) => await this.loadCache(options),
      loadFolders: async (options = {}) => await this.loadFolders(options),
      listDocuments: async () => await this.listDocuments(),
      nowIso: () => this.nowIso(),
      state: this.#state.exports,
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
      handlers: {
        exportNotes: async (match, action) => await this.runAutomationNotesAction(match, action),
        exportTranscripts: async (match, action) =>
          await this.runAutomationTranscriptAction(match, action),
        prepareAgentAttempt: async (match, rule, action, bundle, harness) =>
          await this.buildAutomationAgentAttempt(match, rule, action, bundle, harness),
        runCommand: async (match, rule, action, context) =>
          await this.runAutomationCommand(match, rule, action, context),
        runPkmSync: async (match, rule, action, context) =>
          await this.runAutomationPkmSync(match, rule, action, context),
        runSlackMessage: async (match, rule, action, context) =>
          await this.runAutomationSlackMessage(match, rule, action, context),
        runWebhook: async (match, rule, action, context) =>
          await this.runAutomationWebhook(match, rule, action, context),
        writeFile: async (match, rule, action, context) =>
          await this.runAutomationWriteFile(match, rule, action, context),
      },
      maybeReadMeetingBundleById: async (id, options) =>
        await this.maybeReadMeetingBundleById(id, options),
      nowIso: () => this.nowIso(),
      onArtefactsChanged: async (artefacts) => {
        await this.#index.mergeArtefacts(artefacts);
      },
      readMeetingBundleById: async (id, options) => await this.readMeetingBundleById(id, options),
      state: this.#state,
    });
    this.#state.index.filePath = defaultMeetingIndexFilePath();
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
    return this.#state.plugins.automation.enabled;
  }

  private assertAutomationPluginEnabled(): void {
    if (!this.automationPluginEnabled()) {
      throw new Error("automation plugin is disabled. Enable it in Settings -> Plugins first.");
    }
  }

  private async persistSyncState(): Promise<void> {
    if (!this.deps.syncStateStore) {
      return;
    }

    await this.deps.syncStateStore.writeState(this.#state.sync);
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

  private createSyncRunId(): string {
    return `sync-${this.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "")}`;
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

  async listPlugins(): Promise<GranolaAppPluginsResult> {
    return {
      plugins: [clonePluginState(this.#state.plugins.automation)],
    };
  }

  async setPluginEnabled(id: GranolaAppPluginId, enabled: boolean): Promise<GranolaAppPluginState> {
    const nextPlugin = defaultAutomationPluginState(enabled);
    this.#state.plugins = {
      automation: nextPlugin,
      loaded: true,
    };
    this.#state.config = {
      ...this.#state.config,
      plugins: {
        automationEnabled: enabled,
        settingsFile:
          this.#state.config.plugins?.settingsFile ?? this.config.plugins?.settingsFile ?? "",
      },
    };

    if (this.deps.pluginSettingsStore) {
      await this.deps.pluginSettingsStore.writeSettings({
        automationEnabled: enabled,
      });
    }

    this.emitStateUpdate();
    return clonePluginState(nextPlugin);
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
    options: { note?: string } = {},
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

  private async runAutomationNotesAction(
    match: GranolaAutomationMatch,
    action: GranolaAutomationExportNotesAction,
  ): Promise<
    | {
        format: string;
        outputDir: string;
        scope: GranolaExportScope;
        written: number;
      }
    | undefined
  > {
    const bundle = await this.maybeReadMeetingBundleById(match.meetingId);
    if (!bundle) {
      return undefined;
    }

    const scope = meetingExportScope({
      meetingId: bundle.source.document.id,
      meetingTitle: bundle.meeting.meeting.title || bundle.source.document.id,
    });
    const result = await this.#exports.runNotesExport({
      documents: [bundle.source.document],
      format: action.format ?? "markdown",
      outputDir: resolveExportOutputDir(action.outputDir ?? this.config.notes.output, scope, {
        scopedDirectory: action.scopedOutput,
      }),
      scope,
      trackLastRun: false,
      updateUi: false,
    });

    return {
      format: result.format,
      outputDir: result.outputDir,
      scope: result.scope,
      written: result.written,
    };
  }

  private async runAutomationTranscriptAction(
    match: GranolaAutomationMatch,
    action: GranolaAutomationExportTranscriptAction,
  ): Promise<
    | {
        format: string;
        outputDir: string;
        scope: GranolaExportScope;
        written: number;
      }
    | undefined
  > {
    const bundle = await this.maybeReadMeetingBundleById(match.meetingId);
    if (!bundle) {
      return undefined;
    }

    const { source } = bundle;
    const cacheData = scopedCacheDataForMeeting(source);
    if (!cacheData) {
      return undefined;
    }

    const cacheDocument = cacheData.documents[source.document.id];
    const transcriptSegments = cacheData.transcripts[source.document.id];
    if (!cacheDocument || !transcriptSegments || transcriptSegments.length === 0) {
      return undefined;
    }

    const scope = meetingExportScope({
      meetingId: source.document.id,
      meetingTitle: bundle.meeting.meeting.title || source.document.id,
    });
    const result = await this.#exports.runTranscriptsExport({
      cacheData: {
        documents: {
          [source.document.id]: cacheDocument,
        },
        transcripts: {
          [source.document.id]: transcriptSegments,
        },
      },
      format: action.format ?? "text",
      outputDir: resolveExportOutputDir(action.outputDir ?? this.config.transcripts.output, scope, {
        scopedDirectory: action.scopedOutput,
      }),
      scope,
      trackLastRun: false,
      updateUi: false,
    });

    return {
      format: result.format,
      outputDir: result.outputDir,
      scope: result.scope,
      written: result.written,
    };
  }

  private async buildAutomationExecutionBundle(
    match: GranolaAutomationMatch,
  ): Promise<GranolaMeetingBundle | undefined> {
    if (match.eventKind === "meeting.removed") {
      return undefined;
    }

    return await this.maybeReadMeetingBundleById(match.meetingId, {
      requireCache: false,
    });
  }

  private buildAutomationDeliveryPayloadForAction(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: {
      id: string;
      kind: GranolaAutomationActionRun["actionKind"];
      name?: string;
    },
    context: AutomationActionContext,
    bundle: GranolaMeetingBundle | undefined,
  ) {
    return buildAutomationDeliveryPayload({
      action,
      artefact: context.artefact ? structuredClone(context.artefact) : undefined,
      bundle,
      decision: context.decision,
      generatedAt: this.nowIso(),
      match: {
        ...match,
        folders: match.folders.map((folder) => ({ ...folder })),
        tags: [...match.tags],
      },
      note: context.note,
      rule,
      trigger: context.trigger,
    });
  }

  private async runAutomationCommand(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationCommandAction,
    context: AutomationActionContext,
  ): Promise<{
    command: string;
    cwd?: string;
    output?: string;
  }> {
    const bundle = await this.buildAutomationExecutionBundle(match);
    const cwd = action.cwd ? resolvePath(action.cwd) : process.cwd();
    const payload = JSON.stringify(
      {
        ...this.buildAutomationDeliveryPayloadForAction(
          match,
          rule,
          {
            id: action.id,
            kind: "command",
            name: automationActionName(action),
          },
          context,
          bundle,
        ),
        authMode: this.#state.auth.mode,
      },
      null,
      2,
    );

    return await new Promise((resolve, reject) => {
      const child = spawn(action.command, action.args ?? [], {
        cwd,
        env: {
          ...process.env,
          ...action.env,
          GRANOLA_ACTION_KIND: "command",
          GRANOLA_ACTION_TRIGGER: context.trigger,
          GRANOLA_APPROVAL_DECISION: context.decision,
          GRANOLA_ARTEFACT_ID: context.artefact?.id,
          GRANOLA_EVENT_ID: match.eventId,
          GRANOLA_EVENT_KIND: match.eventKind,
          GRANOLA_MATCH_ID: match.id,
          GRANOLA_MEETING_ID: match.meetingId,
          GRANOLA_RULE_ID: rule.id,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;
      const timeoutMs = action.timeoutMs ?? this.config.notes.timeoutMs;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        if (timedOut) {
          reject(new Error(`automation command timed out after ${timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          reject(
            new Error(stderr || stdout || `automation command exited with status ${String(code)}`),
          );
          return;
        }

        resolve({
          command: [action.command, ...(action.args ?? [])].join(" "),
          cwd,
          output: stdout || stderr || undefined,
        });
      });

      if (action.stdin !== "none") {
        child.stdin.write(payload);
      }
      child.stdin.end();
    });
  }

  private async runAutomationWebhook(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationWebhookAction,
    context: AutomationActionContext,
  ): Promise<{
    output?: string;
    status: number;
    url: string;
  }> {
    const bundle = await this.buildAutomationExecutionBundle(match);
    const payload = this.buildAutomationDeliveryPayloadForAction(
      match,
      rule,
      {
        id: action.id,
        kind: "webhook",
        name: automationActionName(action),
      },
      context,
      bundle,
    );
    const url = action.url?.trim() || (action.urlEnv ? process.env[action.urlEnv]?.trim() : "");
    if (!url) {
      throw new Error(`automation webhook action ${action.id} is missing a URL`);
    }

    const rendered = renderWebhookBody(action, payload);
    const response = await fetch(url, {
      body: rendered.body,
      headers: {
        "content-type": rendered.contentType,
        ...action.headers,
      },
      method: action.method ?? "POST",
    });
    const output = (await response.text()).trim() || undefined;
    if (!response.ok) {
      throw new Error(output || `automation webhook failed with status ${response.status}`);
    }

    return {
      output,
      status: response.status,
      url,
    };
  }

  private async runAutomationSlackMessage(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationSlackMessageAction,
    context: AutomationActionContext,
  ): Promise<{
    output?: string;
    status: number;
    text: string;
    url: string;
  }> {
    const bundle = await this.buildAutomationExecutionBundle(match);
    const payload = this.buildAutomationDeliveryPayloadForAction(
      match,
      rule,
      {
        id: action.id,
        kind: "slack-message",
        name: automationActionName(action),
      },
      context,
      bundle,
    );
    const url =
      action.webhookUrl?.trim() ||
      (action.webhookUrlEnv
        ? process.env[action.webhookUrlEnv]?.trim()
        : process.env.SLACK_WEBHOOK_URL?.trim());
    if (!url) {
      throw new Error(`automation Slack action ${action.id} is missing a webhook URL`);
    }

    const text = renderSlackMessageText(action, payload);
    const response = await fetch(url, {
      body: JSON.stringify({ text }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const output = (await response.text()).trim() || undefined;
    if (!response.ok) {
      throw new Error(output || `automation Slack action failed with status ${response.status}`);
    }

    return {
      output,
      status: response.status,
      text,
      url,
    };
  }

  private async runAutomationWriteFile(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationWriteFileAction,
    context: AutomationActionContext,
  ): Promise<{
    bytes: number;
    filePath: string;
    format: string;
  }> {
    const bundle = await this.buildAutomationExecutionBundle(match);
    const payload = this.buildAutomationDeliveryPayloadForAction(
      match,
      rule,
      {
        id: action.id,
        kind: "write-file",
        name: automationActionName(action),
      },
      context,
      bundle,
    );
    const filePath = resolveWriteFilePath(action, payload);
    if (existsSync(filePath) && action.overwrite === false) {
      throw new Error(`automation write-file target already exists: ${filePath}`);
    }

    const content = renderWriteFileContent(action, payload);
    await writeTextFile(filePath, content);
    return {
      bytes: Buffer.byteLength(content, "utf8"),
      filePath,
      format: action.format ?? "markdown",
    };
  }

  private async readPkmTargets(): Promise<GranolaPkmTarget[]> {
    if (!this.deps.pkmTargetStore) {
      return [];
    }

    return (await this.deps.pkmTargetStore.readTargets()).map((target) => ({ ...target }));
  }

  private pkmFrontmatterEnabled(target: GranolaPkmTarget): boolean {
    return target.frontmatter ?? target.kind === "obsidian";
  }

  private buildPkmFrontmatter(
    target: GranolaPkmTarget,
    artefact: GranolaAutomationArtefact,
    match: GranolaAutomationMatch,
  ): string {
    if (!this.pkmFrontmatterEnabled(target)) {
      return "";
    }

    const lines = [
      "---",
      `title: ${quoteYamlString(artefact.structured.title)}`,
      `meetingId: ${quoteYamlString(match.meetingId)}`,
      `artefactId: ${quoteYamlString(artefact.id)}`,
      `artefactKind: ${quoteYamlString(artefact.kind)}`,
      `ruleId: ${quoteYamlString(artefact.ruleId)}`,
      `sourceActionId: ${quoteYamlString(artefact.actionId)}`,
      `provider: ${quoteYamlString(artefact.provider)}`,
      `model: ${quoteYamlString(artefact.model)}`,
      "tags:",
      ...match.tags.map((tag) => `  - ${quoteYamlString(tag)}`),
      "folders:",
      ...match.folders.map((folder) => `  - ${quoteYamlString(folder.name)}`),
      "---",
      "",
    ];

    return lines.join("\n");
  }

  private async runAutomationPkmSync(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationPkmSyncAction,
    context: AutomationActionContext,
  ): Promise<{
    filePath: string;
    targetId: string;
  }> {
    if (!context.artefact) {
      throw new Error(`automation PKM sync action ${action.id} requires an artefact`);
    }

    const target = (await this.readPkmTargets()).find(
      (candidate) => candidate.id === action.targetId,
    );
    if (!target) {
      throw new Error(`automation PKM target not found: ${action.targetId}`);
    }

    const meetingTitle = match.title || context.artefact.structured.title;
    const folderName = match.folders[0]?.name;
    const outputDir =
      target.folderSubdirectories && folderName
        ? join(target.outputDir, sanitiseFilename(folderName, "folder"))
        : target.outputDir;
    const fileName = target.filenameTemplate?.trim()
      ? target.filenameTemplate
          .replaceAll("{{meeting.title}}", meetingTitle)
          .replaceAll("{{artefact.kind}}", context.artefact.kind)
          .replaceAll("{{artefact.title}}", context.artefact.structured.title)
      : `${sanitiseFilename(`${meetingTitle}-${context.artefact.kind}`)}.md`;
    const filePath = join(outputDir, sanitiseFilename(fileName, "meeting.md"));
    const content = `${this.buildPkmFrontmatter(target, context.artefact, match)}${context.artefact.structured.markdown.trim()}\n`;
    await writeTextFile(filePath, content);
    return {
      filePath,
      targetId: target.id,
    };
  }

  private async buildAutomationAgentAttempt(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationAgentAction,
    bundle: GranolaMeetingBundle | undefined,
    harness: GranolaAgentHarness | undefined,
  ): Promise<ResolvedAutomationAgentAttempt> {
    const harnessCwd = harness?.cwd;
    const promptFile = await readOptionalActionFile(action.promptFile, action.cwd ?? harnessCwd);
    const harnessPromptFile = await readOptionalActionFile(harness?.promptFile, harnessCwd);
    const systemPromptFile = await readOptionalActionFile(
      action.systemPromptFile,
      action.cwd ?? harnessCwd,
    );
    const harnessSystemPromptFile = await readOptionalActionFile(
      harness?.systemPromptFile,
      harnessCwd,
    );
    let instructions = combinePromptSections(
      harnessPromptFile,
      harness?.prompt,
      promptFile,
      action.prompt,
    );
    if (!instructions) {
      throw new Error(`automation agent action ${action.id} is missing prompt instructions`);
    }

    if (action.pipeline) {
      instructions = buildPipelineInstructions(action.pipeline.kind, instructions);
    }

    return {
      harness,
      prompt: buildAutomationAgentPrompt(match, rule, instructions, bundle),
      request: {
        cwd: action.cwd ?? harnessCwd,
        dryRun: action.dryRun,
        model: action.model ?? harness?.model,
        prompt: buildAutomationAgentPrompt(match, rule, instructions, bundle),
        provider: action.provider ?? harness?.provider,
        retries: action.retries,
        systemPrompt: combinePromptSections(
          harnessSystemPromptFile,
          harness?.systemPrompt,
          systemPromptFile,
          action.systemPrompt,
        ),
        timeoutMs: action.timeoutMs,
      },
      systemPrompt: combinePromptSections(
        harnessSystemPromptFile,
        harness?.systemPrompt,
        systemPromptFile,
        action.systemPrompt,
      ),
    };
  }

  private async runSync(options: {
    forceRefresh?: boolean;
    foreground: boolean;
  }): Promise<GranolaAppSyncResult> {
    const previousMeetings = this.#index.meetings();
    this.#state.sync = {
      ...this.#state.sync,
      lastError: undefined,
      lastStartedAt: this.nowIso(),
      running: true,
    };
    this.emitStateUpdate();

    try {
      const snapshot = await this.liveMeetingSnapshot({
        forceRefresh: options.forceRefresh ?? true,
      });
      await this.#index.persistMeetingIndex(snapshot.meetings);
      await this.#index.persistSearchIndex(
        buildSearchIndex(snapshot.documents, {
          artefacts: this.automationPluginEnabled() ? this.#automation.artefacts() : [],
          cacheData: snapshot.cacheData,
          foldersByDocumentId: this.buildFoldersByDocumentId(snapshot.folders),
        }),
      );
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
      if (this.automationPluginEnabled()) {
        await this.#automation.processSyncEvents(events, completedAt);
      }
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
    return await this.#catalog.listDocuments(options);
  }

  async loadCache(
    options: { forceRefresh?: boolean; required?: boolean } = {},
  ): Promise<CacheData | undefined> {
    return await this.#catalog.loadCache(options);
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
      this.#index.triggerBackgroundRefresh(async () => {
        try {
          await this.runSync({ foreground: false });
        } catch {
          // Opportunistic background sync should not break the foreground view.
        }
      });
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

    await this.#index.persistMeetingIndex(snapshot.meetings);

    return {
      meetings,
      source: "live",
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

  async listExportJobs(
    options: GranolaExportJobsListOptions = {},
  ): Promise<GranolaExportJobsResult> {
    return await this.#exports.listJobs(options);
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
  const meetingIndexStore = createDefaultMeetingIndexStore();
  const meetingIndex = await meetingIndexStore.readIndex();
  const pkmTargetStore = createDefaultPkmTargetStore(config.automation?.pkmTargetsFile);
  const pluginSettingsStore = createDefaultPluginSettingsStore(config.plugins?.settingsFile);
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
      pkmTargetStore,
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
