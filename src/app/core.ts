import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";

import {
  createDefaultAgentHarnessStore,
  explainAgentHarnesses,
  matchAgentHarnesses,
  resolveAgentHarness,
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
  type GranolaAutomationAgentRequest,
  type GranolaAutomationAgentRunner,
} from "../agents.ts";
import {
  automationActionName,
  buildAutomationApprovalActionRunId,
  buildAutomationActionRunId,
  enabledAutomationActions,
  executeAutomationAction,
  type AutomationActionContext,
} from "../automation-actions.ts";
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
import {
  buildProcessingIssues,
  collectPipelineRecoveryContexts,
  parseProcessingIssueId,
} from "../processing-health.ts";
import { buildPipelineInstructions, parsePipelineOutput } from "../processing.ts";
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
  GranolaAutomationArtefactAttempt,
  GranolaAutomationArtefactHistoryAction,
  GranolaAutomationArtefactHistoryEntry,
  GranolaAutomationCommandAction,
  GranolaAutomationAgentAction,
  GranolaAutomationApprovalMode,
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
  GranolaSyncEventKind,
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
import { GranolaIndexService } from "./index-service.ts";

interface GranolaAppDependencies {
  agentHarnessStore?: AgentHarnessStore;
  agentRunner?: GranolaAutomationAgentRunner;
  auth: GranolaAppAuthState;
  authController?: DefaultGranolaAuthController;
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
  exportJobs?: GranolaAppExportJobState[];
  granolaClient?: GranolaCatalogClient;
  meetingIndex?: MeetingSummaryRecord[];
  meetingIndexStore?: MeetingIndexStore;
  pkmTargetStore?: PkmTargetStore;
  now?: () => Date;
  searchIndex?: GranolaSearchIndexEntry[];
  searchIndexStore?: SearchIndexStore;
  syncEventStore?: SyncEventStore;
  syncState?: GranolaAppSyncState;
  syncStateStore?: SyncStateStore;
}

interface ResolvedAutomationAgentAttempt {
  harness?: GranolaAgentHarness;
  prompt: string;
  request: GranolaAutomationAgentRequest;
  systemPrompt?: string;
}

function defaultHarnessEventKind(bundle: GranolaMeetingBundle): GranolaSyncEventKind {
  return bundle.meeting.meeting.transcriptLoaded ? "transcript.ready" : "meeting.changed";
}

function harnessEvaluationMatch(
  bundle: GranolaMeetingBundle,
  generatedAt: string,
  eventKind = defaultHarnessEventKind(bundle),
): GranolaAutomationMatch {
  return {
    eventId: `evaluate:${bundle.document.id}`,
    eventKind,
    folders: bundle.meeting.meeting.folders.map((folder) => ({ ...folder })),
    id: `evaluate:${bundle.document.id}`,
    matchedAt: generatedAt,
    meetingId: bundle.document.id,
    ruleId: "automation-evaluation",
    ruleName: "Automation evaluation",
    tags: [...bundle.meeting.meeting.tags],
    title: bundle.meeting.meeting.title || bundle.document.title || bundle.document.id,
    transcriptLoaded: bundle.meeting.meeting.transcriptLoaded,
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

function buildAutomationArtefactId(runId: string, kind: GranolaAutomationArtefact["kind"]): string {
  return `${kind}:${runId}`;
}

function buildAutomationAgentPrompt(
  match: GranolaAutomationMatch,
  rule: GranolaAutomationRule,
  instructions: string,
  bundle?: GranolaMeetingBundle,
): string {
  const transcriptText = bundle ? meetingTranscriptText(bundle)?.trim() : undefined;
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
          id: bundle.document.id,
          notesPlain: bundle.document.notesPlain,
          roleHelpers: bundle.meeting.roleHelpers,
          tags: [...bundle.document.tags],
          title: bundle.document.title,
          updatedAt: bundle.document.updatedAt,
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
    bundle?.document.notesPlain?.trim()
      ? `Existing notes:\n${bundle.document.notesPlain.trim()}`
      : "",
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
      agents: config.agents ? { ...config.agents } : undefined,
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
    },
  };
}

export class GranolaApp implements GranolaAppApi {
  #automationActionRuns: GranolaAutomationActionRun[];
  #automationArtefacts: GranolaAutomationArtefact[];
  #automationMatches: GranolaAutomationMatch[];
  #automationRules: GranolaAutomationRule[];
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
    this.#state = defaultState(config, deps.auth, options.surface ?? "cli");
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
      createGranolaClient: deps.createGranolaClient,
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
    this.#automationArtefacts = (deps.automationArtefacts ?? []).map((artefact) =>
      this.cloneAutomationArtefact(artefact),
    );
    this.#automationMatches = (deps.automationMatches ?? []).map((match) => ({
      ...match,
      folders: match.folders.map((folder) => ({ ...folder })),
      tags: [...match.tags],
    }));
    this.#automationActionRuns = (deps.automationRuns ?? []).map((run) =>
      this.cloneAutomationRun(run),
    );
    this.#automationRules = (deps.automationRules ?? []).map((rule) =>
      this.cloneAutomationRule(rule),
    );
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
      exportJobStore: deps.exportJobStore,
      loadCache: async (options = {}) => await this.loadCache(options),
      loadFolders: async (options = {}) => await this.loadFolders(options),
      listDocuments: async () => await this.listDocuments(),
      nowIso: () => this.nowIso(),
      state: this.#state.exports,
    });
    this.#state.automation = {
      artefactCount: this.#automationArtefacts.length,
      artefactsFile: config.automation?.artefactsFile ?? defaultAutomationArtefactsFilePath(),
      lastRunAt:
        this.#automationActionRuns[0]?.finishedAt ?? this.#automationActionRuns[0]?.startedAt,
      lastMatchedAt: this.#automationMatches[0]?.matchedAt,
      loaded: true,
      matchCount: this.#automationMatches.length,
      matchesFile: defaultAutomationMatchesFilePath(),
      pendingArtefactCount: this.#automationArtefacts.filter(
        (artefact) => artefact.status === "generated",
      ).length,
      pendingRunCount: this.#automationActionRuns.filter((run) => run.status === "pending").length,
      ruleCount: this.#automationRules.length,
      rulesFile: config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
      runCount: this.#automationActionRuns.length,
      runsFile: defaultAutomationRunsFilePath(),
    };
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

  private async persistSyncState(): Promise<void> {
    if (!this.deps.syncStateStore) {
      return;
    }

    await this.deps.syncStateStore.writeState(this.#state.sync);
  }

  private cloneAutomationRule(rule: GranolaAutomationRule): GranolaAutomationRule {
    return {
      ...rule,
      actions: rule.actions?.map((action) => {
        switch (action.kind) {
          case "agent":
            return { ...action };
          case "ask-user":
            return { ...action };
          case "command":
            return {
              ...action,
              args: action.args ? [...action.args] : undefined,
              env: action.env ? { ...action.env } : undefined,
            };
          case "export-notes":
          case "export-transcript":
            return { ...action };
          case "pkm-sync":
            return { ...action };
          case "slack-message":
            return { ...action };
          case "webhook":
            return {
              ...action,
              headers: action.headers ? { ...action.headers } : undefined,
            };
          case "write-file":
            return { ...action };
        }
      }),
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

  private cloneAutomationRun(run: GranolaAutomationActionRun): GranolaAutomationActionRun {
    return {
      ...run,
      artefactIds: run.artefactIds ? [...run.artefactIds] : undefined,
      folders: run.folders.map((folder) => ({ ...folder })),
      meta: run.meta ? structuredClone(run.meta) : undefined,
      tags: [...run.tags],
    };
  }

  private cloneAutomationArtefact(artefact: GranolaAutomationArtefact): GranolaAutomationArtefact {
    return {
      ...artefact,
      attempts: artefact.attempts.map((attempt) => ({ ...attempt })),
      history: artefact.history.map((entry) => ({ ...entry })),
      structured: {
        ...artefact.structured,
        actionItems: artefact.structured.actionItems.map((item) => ({ ...item })),
        decisions: [...artefact.structured.decisions],
        followUps: [...artefact.structured.followUps],
        highlights: [...artefact.structured.highlights],
        metadata: artefact.structured.metadata
          ? structuredClone(artefact.structured.metadata)
          : undefined,
        participantSummaries: artefact.structured.participantSummaries?.map((summary) => ({
          ...summary,
          actionItems: [...summary.actionItems],
        })),
        sections: artefact.structured.sections.map((section) => ({ ...section })),
      },
    };
  }

  private refreshAutomationState(): void {
    const latestMatch = this.#automationMatches.reduce<GranolaAutomationMatch | undefined>(
      (current, candidate) =>
        !current || candidate.matchedAt.localeCompare(current.matchedAt) > 0 ? candidate : current,
      undefined,
    );
    const latestRun = this.#automationActionRuns.reduce<GranolaAutomationActionRun | undefined>(
      (current, candidate) => {
        const candidateTime = candidate.finishedAt ?? candidate.startedAt;
        const currentTime = current ? (current.finishedAt ?? current.startedAt) : undefined;
        return !currentTime || candidateTime.localeCompare(currentTime) > 0 ? candidate : current;
      },
      undefined,
    );

    this.#state.automation = {
      ...this.#state.automation,
      artefactCount: this.#automationArtefacts.length,
      artefactsFile: this.config.automation?.artefactsFile ?? defaultAutomationArtefactsFilePath(),
      lastMatchedAt: latestMatch?.matchedAt ?? this.#state.automation.lastMatchedAt,
      lastRunAt: latestRun?.finishedAt ?? latestRun?.startedAt ?? this.#state.automation.lastRunAt,
      loaded: true,
      matchCount: this.#automationMatches.length,
      matchesFile: defaultAutomationMatchesFilePath(),
      pendingArtefactCount: this.#automationArtefacts.filter(
        (artefact) => artefact.status === "generated",
      ).length,
      pendingRunCount: this.#automationActionRuns.filter((run) => run.status === "pending").length,
      ruleCount: this.#automationRules.length,
      rulesFile: this.config.automation?.rulesFile ?? defaultAutomationRulesFilePath(),
      runCount: this.#automationActionRuns.length,
      runsFile: defaultAutomationRunsFilePath(),
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
    this.refreshAutomationState();
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
    this.refreshAutomationState();
  }

  private async appendAutomationRuns(runs: GranolaAutomationActionRun[]): Promise<void> {
    if (runs.length === 0) {
      return;
    }

    if (this.deps.automationRunStore) {
      await this.deps.automationRunStore.appendRuns(runs);
    }

    for (const run of runs) {
      const index = this.#automationActionRuns.findIndex((candidate) => candidate.id === run.id);
      if (index >= 0) {
        this.#automationActionRuns[index] = this.cloneAutomationRun(run);
      } else {
        this.#automationActionRuns.push(this.cloneAutomationRun(run));
      }
    }

    this.#automationActionRuns.sort((left, right) =>
      (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt),
    );
    this.refreshAutomationState();
  }

  private async writeAutomationArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void> {
    this.#automationArtefacts = artefacts
      .map((artefact) => this.cloneAutomationArtefact(artefact))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    if (this.deps.automationArtefactStore) {
      await this.deps.automationArtefactStore.writeArtefacts(this.#automationArtefacts);
    }

    await this.#index.mergeArtefacts(this.#automationArtefacts);

    this.refreshAutomationState();
  }

  private buildAutomationArtefactHistoryEntry(
    action: GranolaAutomationArtefactHistoryAction,
    note?: string,
  ): GranolaAutomationArtefactHistoryEntry {
    return {
      action,
      at: this.nowIso(),
      note: note?.trim() || undefined,
    };
  }

  private async readAutomationArtefactById(
    id: string,
  ): Promise<GranolaAutomationArtefact | undefined> {
    return (
      (this.deps.automationArtefactStore
        ? await this.deps.automationArtefactStore.readArtefact(id)
        : undefined) ?? this.#automationArtefacts.find((artefact) => artefact.id === id)
    );
  }

  private assertMutableAutomationArtefact(artefact: GranolaAutomationArtefact): void {
    if (artefact.status === "superseded") {
      throw new Error(`automation artefact is superseded: ${artefact.id}`);
    }
  }

  private async replaceAutomationArtefact(
    nextArtefact: GranolaAutomationArtefact,
  ): Promise<GranolaAutomationArtefact> {
    const nextArtefacts = [
      this.cloneAutomationArtefact(nextArtefact),
      ...this.#automationArtefacts
        .filter((artefact) => artefact.id !== nextArtefact.id)
        .map((artefact) => this.cloneAutomationArtefact(artefact)),
    ];
    await this.writeAutomationArtefacts(nextArtefacts);
    this.emitStateUpdate();
    return this.cloneAutomationArtefact(
      this.#automationArtefacts.find((artefact) => artefact.id === nextArtefact.id) ?? nextArtefact,
    );
  }

  private createRecoveryRunId(match: GranolaAutomationMatch, actionId: string): string {
    const suffix = this.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "");
    return `recovery:${match.meetingId}:${match.ruleId}:${actionId}:${suffix}`;
  }

  private automationActionHandlers() {
    return {
      exportNotes: async (
        nextMatch: GranolaAutomationMatch,
        nextAction: GranolaAutomationExportNotesAction,
      ) => await this.runAutomationNotesAction(nextMatch, nextAction),
      exportTranscripts: async (
        nextMatch: GranolaAutomationMatch,
        nextAction: GranolaAutomationExportTranscriptAction,
      ) => await this.runAutomationTranscriptAction(nextMatch, nextAction),
      nowIso: () => this.nowIso(),
      runAgent: async (
        nextMatch: GranolaAutomationMatch,
        nextRule: GranolaAutomationRule,
        nextAction: GranolaAutomationAgentAction,
        run: GranolaAutomationActionRun,
      ) => await this.runAutomationAgent(nextMatch, nextRule, nextAction, run),
      runCommand: async (
        nextMatch: GranolaAutomationMatch,
        nextRule: GranolaAutomationRule,
        nextAction: GranolaAutomationCommandAction,
        context: AutomationActionContext,
      ) => await this.runAutomationCommand(nextMatch, nextRule, nextAction, context),
      runSlackMessage: async (
        nextMatch: GranolaAutomationMatch,
        nextRule: GranolaAutomationRule,
        nextAction: GranolaAutomationSlackMessageAction,
        context: AutomationActionContext,
      ) => await this.runAutomationSlackMessage(nextMatch, nextRule, nextAction, context),
      runWebhook: async (
        nextMatch: GranolaAutomationMatch,
        nextRule: GranolaAutomationRule,
        nextAction: GranolaAutomationWebhookAction,
        context: AutomationActionContext,
      ) => await this.runAutomationWebhook(nextMatch, nextRule, nextAction, context),
      runPkmSync: async (
        nextMatch: GranolaAutomationMatch,
        nextRule: GranolaAutomationRule,
        nextAction: GranolaAutomationPkmSyncAction,
        context: AutomationActionContext,
      ) => await this.runAutomationPkmSync(nextMatch, nextRule, nextAction, context),
      writeFile: async (
        nextMatch: GranolaAutomationMatch,
        nextRule: GranolaAutomationRule,
        nextAction: GranolaAutomationWriteFileAction,
        context: AutomationActionContext,
      ) => await this.runAutomationWriteFile(nextMatch, nextRule, nextAction, context),
    };
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

  private async computeProcessingIssues(): Promise<GranolaProcessingIssue[]> {
    const [meetings, rules] = await Promise.all([
      this.currentMeetingSummariesForProcessing(),
      this.loadAutomationRules(),
    ]);
    return buildProcessingIssues({
      artefacts: this.#automationArtefacts.map((artefact) =>
        this.cloneAutomationArtefact(artefact),
      ),
      meetings,
      nowIso: this.nowIso(),
      rules,
      runs: this.#automationActionRuns.map((run) => this.cloneAutomationRun(run)),
      syncState: cloneSyncState(this.#state.sync),
    });
  }

  private async rerunPipelineContexts(
    contexts: ReturnType<typeof collectPipelineRecoveryContexts>,
  ): Promise<GranolaAutomationActionRun[]> {
    const runs: GranolaAutomationActionRun[] = [];

    for (const context of contexts) {
      runs.push(
        await executeAutomationAction(
          this.cloneAutomationMatch(context.match),
          context.rule,
          context.action,
          this.automationActionHandlers(),
          {
            runId: this.createRecoveryRunId(context.match, context.action.id),
          },
        ),
      );
    }

    await this.appendAutomationRuns(runs);
    this.emitStateUpdate();
    return runs.map((run) => this.cloneAutomationRun(run));
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
    const limit = options.limit ?? 20;
    const artefacts = this.deps.automationArtefactStore
      ? await this.deps.automationArtefactStore.readArtefacts({
          kind: options.kind,
          limit,
          meetingId: options.meetingId,
          status: options.status,
        })
      : this.#automationArtefacts
          .filter((artefact) => {
            if (options.kind && artefact.kind !== options.kind) {
              return false;
            }
            if (options.meetingId && artefact.meetingId !== options.meetingId) {
              return false;
            }
            if (options.status && artefact.status !== options.status) {
              return false;
            }
            return true;
          })
          .slice(0, limit);
    return {
      artefacts: artefacts.map((artefact) => this.cloneAutomationArtefact(artefact)),
    };
  }

  async listAgentHarnesses(): Promise<GranolaAgentHarnessesResult> {
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    return {
      harnesses,
    };
  }

  async saveAgentHarnesses(harnesses: GranolaAgentHarness[]): Promise<GranolaAgentHarnessesResult> {
    if (!this.deps.agentHarnessStore) {
      throw new Error("agent harness store is not configured");
    }

    await this.deps.agentHarnessStore.writeHarnesses(harnesses);
    return await this.listAgentHarnesses();
  }

  async explainAgentHarnesses(meetingId: string): Promise<GranolaAgentHarnessExplanationsResult> {
    const bundle = await this.getMeeting(meetingId, {
      requireCache: true,
    }).catch(async () => await this.getMeeting(meetingId));
    const generatedAt = this.nowIso();
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    const eventKind = defaultHarnessEventKind(bundle);

    return {
      eventKind,
      harnesses: explainAgentHarnesses(harnesses, {
        bundle,
        match: harnessEvaluationMatch(bundle, generatedAt, eventKind),
      }),
      meetingId: bundle.document.id,
      meetingTitle: bundle.meeting.meeting.title || bundle.document.title || bundle.document.id,
    };
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
    const generatedAt = this.nowIso();
    const kind = options.kind ?? "notes";
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    const runner = this.deps.agentRunner ?? createDefaultAutomationAgentRunner(this.config);
    const results: GranolaAutomationEvaluationResult["results"] = [];

    for (const evaluationCase of cases) {
      const match = harnessEvaluationMatch(evaluationCase.bundle, generatedAt);
      const selectedHarnesses =
        options.harnessIds && options.harnessIds.length > 0
          ? options.harnessIds.map((harnessId) =>
              resolveAgentHarness(harnesses, { bundle: evaluationCase.bundle, match }, harnessId),
            )
          : matchAgentHarnesses(harnesses, { bundle: evaluationCase.bundle, match });
      const resolvedHarnesses = selectedHarnesses.filter(
        (harness): harness is GranolaAgentHarness => Boolean(harness),
      );

      if (resolvedHarnesses.length === 0) {
        results.push({
          caseId: evaluationCase.id,
          caseTitle: evaluationCase.title,
          error: "No harness matched this fixture case.",
          prompt: "",
          status: "failed",
        });
        continue;
      }

      for (const harness of resolvedHarnesses) {
        const action: GranolaAutomationAgentAction = {
          dryRun: options.dryRun,
          harnessId: harness.id,
          id: `evaluate:${harness.id}`,
          kind: "agent",
          model: options.model,
          pipeline: { kind },
          provider: options.provider,
        };
        const rule: GranolaAutomationRule = {
          id: `evaluate:${harness.id}`,
          name: `Evaluate ${harness.name}`,
          when: {},
        };

        try {
          const attempt = await this.buildAutomationAgentAttempt(
            match,
            rule,
            action,
            evaluationCase.bundle,
            harness,
          );
          const result = await runner.run(attempt.request);
          const parsed = parsePipelineOutput({
            kind,
            meetingTitle: evaluationCase.title,
            rawOutput: result.output ?? "",
            roleHelpers: evaluationCase.bundle.meeting.roleHelpers,
          });
          results.push({
            caseId: evaluationCase.id,
            caseTitle: evaluationCase.title,
            harnessId: harness.id,
            harnessName: harness.name,
            model: result.model,
            parseMode: parsed.parseMode,
            prompt: result.prompt,
            provider: result.provider,
            rawOutput: result.output ?? "",
            status: "completed",
            structured: parsed.structured,
          });
        } catch (error) {
          results.push({
            caseId: evaluationCase.id,
            caseTitle: evaluationCase.title,
            error: error instanceof Error ? error.message : String(error),
            harnessId: harness.id,
            harnessName: harness.name,
            model: options.model ?? harness.model,
            prompt: "",
            provider: options.provider ?? harness.provider,
            status: "failed",
          });
        }
      }
    }

    return {
      generatedAt,
      kind,
      results,
    };
  }

  async getAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    const artefact = await this.readAutomationArtefactById(id);
    if (!artefact) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    return this.cloneAutomationArtefact(artefact);
  }

  async listProcessingIssues(
    options: {
      limit?: number;
      meetingId?: string;
      severity?: GranolaProcessingIssueSeverity;
    } = {},
  ): Promise<GranolaProcessingIssuesResult> {
    const limit = options.limit ?? 20;
    const issues = (await this.computeProcessingIssues())
      .filter((issue) => {
        if (options.meetingId && issue.meetingId !== options.meetingId) {
          return false;
        }
        if (options.severity && issue.severity !== options.severity) {
          return false;
        }
        return true;
      })
      .slice(0, limit);

    return {
      issues: issues.map((issue) => ({ ...issue })),
    };
  }

  async listAutomationRules(): Promise<GranolaAutomationRulesResult> {
    const rules = await this.loadAutomationRules({ forceRefresh: true });
    return {
      rules: rules.map((rule) => this.cloneAutomationRule(rule)),
    };
  }

  async saveAutomationRules(rules: GranolaAutomationRule[]): Promise<GranolaAutomationRulesResult> {
    if (!this.deps.automationRuleStore) {
      throw new Error("automation rule store is not configured");
    }

    await this.deps.automationRuleStore.writeRules(
      rules.map((rule) => this.cloneAutomationRule(rule)),
    );
    this.#automationRules = rules.map((rule) => this.cloneAutomationRule(rule));
    this.refreshAutomationState();
    this.emitStateUpdate();
    return {
      rules: this.#automationRules.map((rule) => this.cloneAutomationRule(rule)),
    };
  }

  async listAutomationMatches(
    options: { limit?: number } = {},
  ): Promise<GranolaAutomationMatchesResult> {
    const limit = options.limit ?? 20;
    const matches = this.deps.automationMatchStore
      ? await this.deps.automationMatchStore.readMatches(limit)
      : this.#automationMatches.slice(-limit).reverse();
    return {
      matches: matches.map((match) => this.cloneAutomationMatch(match)),
    };
  }

  async listAutomationRuns(
    options: { limit?: number; status?: GranolaAutomationActionRun["status"] } = {},
  ): Promise<GranolaAutomationRunsResult> {
    const limit = options.limit ?? 20;
    const runs = this.deps.automationRunStore
      ? await this.deps.automationRunStore.readRuns({
          limit,
          status: options.status,
        })
      : this.#automationActionRuns
          .filter((run) => (options.status ? run.status === options.status : true))
          .slice(0, limit);
    return {
      runs: runs.map((run) => this.cloneAutomationRun(run)),
    };
  }

  async resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string } = {},
  ): Promise<GranolaAutomationActionRun> {
    const current =
      (this.deps.automationRunStore ? await this.deps.automationRunStore.readRun(id) : undefined) ??
      this.#automationActionRuns.find((run) => run.id === id);
    if (!current) {
      throw new Error(`automation run not found: ${id}`);
    }

    if (current.status !== "pending") {
      throw new Error(`automation run is not pending: ${id}`);
    }

    const finishedAt = this.nowIso();
    const resolved: GranolaAutomationActionRun = {
      ...this.cloneAutomationRun(current),
      finishedAt,
      meta: {
        ...(current.meta ? structuredClone(current.meta) : {}),
        decision,
        note: options.note?.trim() || undefined,
      },
      result:
        decision === "approve"
          ? options.note?.trim() || "Approved by user"
          : options.note?.trim() || "Rejected by user",
      status: decision === "approve" ? "completed" : "skipped",
    };

    await this.appendAutomationRuns([resolved]);
    this.emitStateUpdate();
    return this.cloneAutomationRun(resolved);
  }

  private async readAutomationMatchById(id: string): Promise<GranolaAutomationMatch | undefined> {
    return (
      (this.deps.automationMatchStore
        ? (await this.deps.automationMatchStore.readMatches(0)).find(
            (candidate) => candidate.id === id,
          )
        : undefined) ?? this.#automationMatches.find((candidate) => candidate.id === id)
    );
  }

  private pipelineApprovalMode(
    action: GranolaAutomationAgentAction,
  ): GranolaAutomationApprovalMode {
    return action.approvalMode ?? "manual";
  }

  private async runPostApprovalActions(
    artefact: GranolaAutomationArtefact,
    options: { decision: "approve" | "reject"; note?: string },
  ): Promise<GranolaAutomationActionRun[]> {
    if (options.decision !== "approve") {
      return [];
    }

    const rule = (await this.loadAutomationRules({ forceRefresh: true })).find(
      (candidate) => candidate.id === artefact.ruleId,
    );
    if (!rule) {
      return [];
    }

    const match = await this.readAutomationMatchById(artefact.matchId);
    if (!match) {
      return [];
    }

    const actions = enabledAutomationActions(rule, {
      sourceActionId: artefact.actionId,
      trigger: "approval",
    });
    if (actions.length === 0) {
      return [];
    }

    const existingRunIds = new Set(this.#automationActionRuns.map((run) => run.id));
    const runs: GranolaAutomationActionRun[] = [];

    for (const action of actions) {
      const runId = buildAutomationApprovalActionRunId(artefact, action.id);
      if (existingRunIds.has(runId)) {
        continue;
      }

      existingRunIds.add(runId);
      runs.push(
        await executeAutomationAction(
          this.cloneAutomationMatch(match),
          rule,
          action,
          this.automationActionHandlers(),
          {
            context: {
              artefact: this.cloneAutomationArtefact(artefact),
              decision: options.decision,
              note: options.note,
              trigger: "approval",
            },
            runId,
          },
        ),
      );
    }

    await this.appendAutomationRuns(runs);
    this.emitStateUpdate();
    return runs.map((run) => this.cloneAutomationRun(run));
  }

  async resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string } = {},
  ): Promise<GranolaAutomationArtefact> {
    const current = await this.readAutomationArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    this.assertMutableAutomationArtefact(current);
    const shouldRunPostApproval = decision === "approve" && current.status !== "approved";

    const nextArtefact: GranolaAutomationArtefact = {
      ...this.cloneAutomationArtefact(current),
      history: [
        ...current.history.map((entry) => ({ ...entry })),
        this.buildAutomationArtefactHistoryEntry(
          decision === "approve" ? "approved" : "rejected",
          options.note,
        ),
      ],
      status: decision === "approve" ? "approved" : "rejected",
      updatedAt: this.nowIso(),
    };

    const replaced = await this.replaceAutomationArtefact(nextArtefact);
    if (shouldRunPostApproval) {
      await this.runPostApprovalActions(replaced, {
        decision,
        note: options.note,
      });
    }

    return replaced;
  }

  async updateAutomationArtefact(
    id: string,
    patch: GranolaAutomationArtefactUpdate,
  ): Promise<GranolaAutomationArtefact> {
    const current = await this.readAutomationArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    this.assertMutableAutomationArtefact(current);

    const nextTitle = patch.title?.trim();
    const nextSummary = patch.summary?.trim();
    const nextMarkdown = patch.markdown?.trim();
    if (nextTitle === "" || nextMarkdown === "") {
      throw new Error("automation artefact title and markdown must not be empty");
    }

    const nextArtefact: GranolaAutomationArtefact = {
      ...this.cloneAutomationArtefact(current),
      history: [
        ...current.history.map((entry) => ({ ...entry })),
        this.buildAutomationArtefactHistoryEntry("edited", patch.note),
      ],
      structured: {
        ...current.structured,
        markdown: nextMarkdown ?? current.structured.markdown,
        summary: nextSummary === undefined ? current.structured.summary : nextSummary || undefined,
        title: nextTitle ?? current.structured.title,
      },
      updatedAt: this.nowIso(),
    };

    return await this.replaceAutomationArtefact(nextArtefact);
  }

  async recoverProcessingIssue(id: string): Promise<GranolaProcessingRecoveryResult> {
    const issue = (await this.computeProcessingIssues()).find((candidate) => candidate.id === id);
    if (!issue) {
      throw new Error(`processing issue not found: ${id}`);
    }

    const parsed = parseProcessingIssueId(id);

    if (parsed.kind === "sync-stale") {
      await this.sync({
        forceRefresh: true,
        foreground: false,
      });
      return {
        issue: { ...issue },
        recoveredAt: this.nowIso(),
        runCount: 0,
        syncRan: true,
      };
    }

    if (!parsed.meetingId) {
      throw new Error(`processing issue is missing meeting context: ${id}`);
    }

    if (parsed.kind === "transcript-missing") {
      await this.sync({
        forceRefresh: true,
        foreground: false,
      });
      const meetings = await this.currentMeetingSummariesForProcessing();
      const meeting = meetings.find((candidate) => candidate.id === parsed.meetingId);
      if (!meeting?.transcriptLoaded) {
        return {
          issue: { ...issue },
          recoveredAt: this.nowIso(),
          runCount: 0,
          syncRan: true,
        };
      }

      const contexts = collectPipelineRecoveryContexts(
        await this.loadAutomationRules(),
        meeting,
        this.nowIso(),
      );
      const rerunCount = (await this.rerunPipelineContexts(contexts)).length;
      return {
        issue: { ...issue },
        recoveredAt: this.nowIso(),
        runCount: rerunCount,
        syncRan: true,
      };
    }

    const meetings = await this.currentMeetingSummariesForProcessing();
    const meeting = meetings.find((candidate) => candidate.id === parsed.meetingId);
    if (!meeting) {
      throw new Error(`meeting not found for processing issue: ${parsed.meetingId}`);
    }

    if (parsed.kind === "artefact-stale" && parsed.ruleId && parsed.actionId) {
      const latestArtefact = this.#automationArtefacts
        .filter(
          (artefact) =>
            artefact.meetingId === parsed.meetingId &&
            artefact.ruleId === parsed.ruleId &&
            artefact.actionId === parsed.actionId &&
            artefact.status !== "superseded",
        )
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (latestArtefact) {
        await this.rerunAutomationArtefact(latestArtefact.id);
        return {
          issue: { ...issue },
          recoveredAt: this.nowIso(),
          runCount: 1,
          syncRan: false,
        };
      }
    }

    const contexts = collectPipelineRecoveryContexts(
      await this.loadAutomationRules(),
      meeting,
      this.nowIso(),
    ).filter((context) => {
      if (parsed.ruleId && context.rule.id !== parsed.ruleId) {
        return false;
      }
      if (parsed.actionId && context.action.id !== parsed.actionId) {
        return false;
      }
      return true;
    });

    const rerunCount = (await this.rerunPipelineContexts(contexts)).length;
    return {
      issue: { ...issue },
      recoveredAt: this.nowIso(),
      runCount: rerunCount,
      syncRan: false,
    };
  }

  async rerunAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    const current = await this.readAutomationArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    const rules = await this.loadAutomationRules({ forceRefresh: true });
    const rule = rules.find((candidate) => candidate.id === current.ruleId);
    if (!rule) {
      throw new Error(`automation rule not found: ${current.ruleId}`);
    }

    const action = enabledAutomationActions(rule).find(
      (candidate) => candidate.id === current.actionId,
    );
    if (!action || action.kind !== "agent" || !action.pipeline) {
      throw new Error(`automation artefact is not rerunnable: ${id}`);
    }

    const match =
      (this.deps.automationMatchStore
        ? (await this.deps.automationMatchStore.readMatches(0)).find(
            (candidate) => candidate.id === current.matchId,
          )
        : undefined) ??
      this.#automationMatches.find((candidate) => candidate.id === current.matchId);
    if (!match) {
      throw new Error(`automation match not found: ${current.matchId}`);
    }

    const nextRun = await executeAutomationAction(
      this.cloneAutomationMatch(match),
      rule,
      action,
      this.automationActionHandlers(),
      {
        rerunOfId: current.runId,
        runId: `${current.runId}:rerun:${this.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "")}`,
      },
    );

    await this.appendAutomationRuns([nextRun]);

    const nextArtefactId = nextRun.artefactIds?.[0];
    const nextArtefact = nextArtefactId
      ? this.#automationArtefacts.find((artefact) => artefact.id === nextArtefactId)
      : undefined;
    if (!nextArtefact) {
      throw new Error(`rerun did not produce an automation artefact: ${id}`);
    }

    const updatedArtefacts = this.#automationArtefacts.map((artefact) =>
      artefact.id === current.id
        ? {
            ...artefact,
            history: [
              ...artefact.history.map((entry) => ({ ...entry })),
              this.buildAutomationArtefactHistoryEntry("rerun", `Superseded by ${nextArtefact.id}`),
            ],
            status: "superseded" as const,
            supersededById: nextArtefact.id,
            updatedAt: nextArtefact.createdAt,
          }
        : artefact,
    );
    await this.writeAutomationArtefacts(updatedArtefacts);
    this.emitStateUpdate();
    return this.cloneAutomationArtefact(
      this.#automationArtefacts.find((artefact) => artefact.id === nextArtefact.id) ?? nextArtefact,
    );
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
      meetingId: bundle.document.id,
      meetingTitle: bundle.meeting.meeting.title || bundle.document.id,
    });
    const result = await this.#exports.runNotesExport({
      documents: [bundle.document],
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
    if (!bundle?.cacheData) {
      return undefined;
    }

    const cacheDocument = bundle.cacheData.documents[bundle.document.id];
    const transcriptSegments = bundle.cacheData.transcripts[bundle.document.id];
    if (!cacheDocument || !transcriptSegments || transcriptSegments.length === 0) {
      return undefined;
    }

    const scope = meetingExportScope({
      meetingId: bundle.document.id,
      meetingTitle: bundle.meeting.meeting.title || bundle.document.id,
    });
    const result = await this.#exports.runTranscriptsExport({
      cacheData: {
        documents: {
          [bundle.document.id]: cacheDocument,
        },
        transcripts: {
          [bundle.document.id]: transcriptSegments,
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
      artefact: context.artefact ? this.cloneAutomationArtefact(context.artefact) : undefined,
      bundle,
      decision: context.decision,
      generatedAt: this.nowIso(),
      match: this.cloneAutomationMatch(match),
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

  private async runAutomationAgent(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationAgentAction,
    run: GranolaAutomationActionRun,
  ): Promise<{
    artefactIds?: string[];
    attempts?: GranolaAutomationArtefactAttempt[];
    command?: string;
    dryRun: boolean;
    model: string;
    output?: string;
    pipelineKind?: string;
    prompt: string;
    provider: string;
    systemPrompt?: string;
  }> {
    const bundle =
      match.eventKind === "meeting.removed"
        ? undefined
        : await this.maybeReadMeetingBundleById(match.meetingId, {
            requireCache: false,
          });
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    const primaryHarness = resolveAgentHarness(harnesses, { bundle, match }, action.harnessId);
    const fallbackHarnessIds = [
      ...(action.fallbackHarnessIds ?? []),
      ...(primaryHarness?.fallbackHarnessIds ?? []),
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
    const attempts = [
      await this.buildAutomationAgentAttempt(match, rule, action, bundle, primaryHarness),
      ...(await Promise.all(
        fallbackHarnessIds
          .filter((harnessId) => harnessId !== primaryHarness?.id)
          .map(async (harnessId) => {
            const fallbackHarness = resolveAgentHarness(harnesses, { bundle, match }, harnessId);
            return await this.buildAutomationAgentAttempt(
              match,
              rule,
              action,
              bundle,
              fallbackHarness,
            );
          }),
      )),
    ];
    const runner = this.deps.agentRunner ?? createDefaultAutomationAgentRunner(this.config);
    const attemptMeta: GranolaAutomationArtefactAttempt[] = [];
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        const result = await runner.run(attempt.request);
        attemptMeta.push({
          harnessId: attempt.harness?.id,
          model: result.model,
          provider:
            result.provider === "codex" ||
            result.provider === "openai" ||
            result.provider === "openrouter"
              ? result.provider
              : undefined,
        });

        if (action.pipeline) {
          const parsed = parsePipelineOutput({
            kind: action.pipeline.kind,
            meetingTitle: match.title,
            rawOutput: result.output ?? "",
            roleHelpers: bundle?.meeting.roleHelpers,
          });
          const createdAt = this.nowIso();
          const artefact: GranolaAutomationArtefact = {
            actionId: action.id,
            actionName: automationActionName(action),
            attempts: attemptMeta.map((item) => ({ ...item })),
            createdAt,
            eventId: match.eventId,
            history: [
              {
                action: "generated",
                at: createdAt,
                note: run.rerunOfId ? `Rerun of ${run.rerunOfId}` : undefined,
              },
            ],
            id: buildAutomationArtefactId(run.id, action.pipeline.kind),
            kind: action.pipeline.kind,
            matchId: match.id,
            meetingId: match.meetingId,
            model: result.model,
            parseMode: parsed.parseMode,
            prompt: result.prompt,
            provider:
              result.provider === "codex" ||
              result.provider === "openai" ||
              result.provider === "openrouter"
                ? result.provider
                : "codex",
            rawOutput: result.output ?? "",
            rerunOfId: run.rerunOfId
              ? buildAutomationArtefactId(run.rerunOfId, action.pipeline.kind)
              : undefined,
            ruleId: rule.id,
            ruleName: rule.name,
            runId: run.id,
            status: "generated",
            structured: parsed.structured,
            updatedAt: createdAt,
          };
          await this.writeAutomationArtefacts([artefact, ...this.#automationArtefacts]);
          const finalArtefact =
            this.pipelineApprovalMode(action) === "auto"
              ? await this.resolveAutomationArtefact(artefact.id, "approve", {
                  note: "Auto-approved by automation rule",
                })
              : artefact;

          return {
            artefactIds: [finalArtefact.id],
            attempts: attemptMeta,
            command: result.command,
            dryRun: result.dryRun,
            model: result.model,
            output: parsed.structured.summary ?? parsed.structured.markdown,
            pipelineKind: action.pipeline.kind,
            prompt: result.prompt,
            provider: result.provider,
            systemPrompt: result.systemPrompt,
          };
        }

        return {
          attempts: attemptMeta,
          command: result.command,
          dryRun: result.dryRun,
          model: result.model,
          output: result.output,
          prompt: result.prompt,
          provider: result.provider,
          systemPrompt: result.systemPrompt,
        };
      } catch (error) {
        lastError = error;
        attemptMeta.push({
          error: error instanceof Error ? error.message : String(error),
          harnessId: attempt.harness?.id,
          model: attempt.request.model,
          provider: attempt.request.provider,
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(
          typeof lastError === "string"
            ? lastError
            : lastError
              ? JSON.stringify(lastError)
              : "automation agent failed",
        );
  }

  private async runAutomationActions(
    rules: GranolaAutomationRule[],
    matches: GranolaAutomationMatch[],
  ): Promise<GranolaAutomationActionRun[]> {
    const rulesById = new Map(rules.map((rule) => [rule.id, rule] as const));
    const existingRunIds = new Set(this.#automationActionRuns.map((run) => run.id));
    const runs: GranolaAutomationActionRun[] = [];

    for (const match of matches) {
      const rule = rulesById.get(match.ruleId);
      if (!rule) {
        continue;
      }

      for (const action of enabledAutomationActions(rule)) {
        const runId = buildAutomationActionRunId(match, action.id);
        if (existingRunIds.has(runId)) {
          continue;
        }

        existingRunIds.add(runId);
        runs.push(
          await executeAutomationAction(match, rule, action, this.automationActionHandlers()),
        );
      }
    }

    await this.appendAutomationRuns(runs);
    return runs.map((run) => this.cloneAutomationRun(run));
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
          artefacts: this.#automationArtefacts,
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
      const rules = await this.loadAutomationRules();
      const automationMatches = matchAutomationRules(rules, events, completedAt);
      await this.appendAutomationMatches(automationMatches);
      await this.runAutomationActions(rules, automationMatches);
      await this.#index.mergeArtefacts(this.#automationArtefacts);
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
