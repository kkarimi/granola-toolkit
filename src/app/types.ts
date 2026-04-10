import type {
  YazdApprovalMode,
  YazdAskUserWorkflowAction,
  YazdArtefactHistoryAction,
  YazdArtefactHistoryEntry,
  YazdArtefactStatus,
  YazdCommandWorkflowAction,
  YazdSlackMessageWorkflowAction,
  YazdStructuredActionItem,
  YazdStructuredOutput,
  YazdStructuredParticipantSummary,
  YazdStructuredSection,
  YazdTriggeredWorkflowAction,
  YazdWebhookPayloadFormat,
  YazdWebhookWorkflowAction,
  YazdWorkflowActionBase,
  YazdWorkflowDefinition,
  YazdReviewIssue,
  YazdReviewIssueSeverity,
  YazdWorkflowRun,
  YazdWorkflowRunStatus,
  YazdWorkflowTrigger,
  YazdWorkflowWhen,
  YazdWriteFileFormat,
  YazdWriteFileWorkflowAction,
} from "@kkarimi/yazd-core";

import type {
  FolderRecord,
  FolderSummaryRecord,
  GranolaMeetingSpeakerRole,
  GranolaSessionMetadata,
  MeetingRecord,
  MeetingRoleHelpersRecord,
  MeetingSummarySource,
  MeetingSummaryRecord,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "./models.ts";
import type {
  GranolaAgentHarness,
  GranolaAgentHarnessMatchExplanation,
} from "../agent-harnesses.ts";
import type {
  GranolaPluginCapability,
  GranolaPluginSettingsContribution,
} from "../plugin-registry.ts";
import type {
  AppConfig,
  CacheData,
  CacheDocument,
  GranolaDocument,
  GranolaAgentProviderKind,
} from "../types.ts";

export type GranolaAppAuthMode = GranolaSessionMetadata["mode"];
export type GranolaAppSurface = "cli" | "server" | "tui" | "web";
export type GranolaMeetingSort = "title-asc" | "title-desc" | "updated-asc" | "updated-desc";
export type GranolaExportJobKind = "notes" | "transcripts";
export type GranolaExportJobStatus = "completed" | "failed" | "running";
export type GranolaSyncChangeKind = "changed" | "created" | "removed" | "transcript-ready";
export type GranolaAutomationArtefactKind = "enrichment" | "notes";
export type GranolaAutomationArtefactHistoryAction = YazdArtefactHistoryAction;
export type GranolaAutomationArtefactStatus = YazdArtefactStatus;
export type GranolaAutomationActionTrigger = YazdWorkflowTrigger;
export type GranolaAutomationApprovalMode = YazdApprovalMode;
export type GranolaProcessingIssueKind =
  | "artefact-stale"
  | "pipeline-failed"
  | "pipeline-missing"
  | "sync-stale"
  | "transcript-missing";
export type GranolaProcessingIssueSeverity = YazdReviewIssueSeverity;
export type GranolaSyncEventKind =
  | "meeting.changed"
  | "meeting.created"
  | "meeting.removed"
  | "transcript.ready";
export type GranolaAutomationActionKind =
  | "agent"
  | "ask-user"
  | "command"
  | "export-notes"
  | "export-transcript"
  | "pkm-sync"
  | "slack-message"
  | "webhook"
  | "write-file";
export type GranolaAutomationActionRunStatus = YazdWorkflowRunStatus;
export type GranolaAutomationWebhookPayloadFormat = YazdWebhookPayloadFormat;
export type GranolaAutomationWriteFileFormat = YazdWriteFileFormat;
export type GranolaPkmTargetKind = "docs-folder" | "obsidian";
export type GranolaPkmTargetTransport = "api" | "filesystem";
export type GranolaPkmTargetReviewMode = "optional" | "recommended" | "required";
export type GranolaExportTargetKind = "bundle-folder" | "obsidian-vault";
export type GranolaExportScope =
  | {
      mode: "all";
    }
  | {
      folderId: string;
      folderName: string;
      mode: "folder";
    }
  | {
      meetingId: string;
      meetingTitle: string;
      mode: "meeting";
    };
export interface GranolaAppAuthState extends GranolaSessionMetadata {}

export type GranolaCatalogSource = "documents" | "file" | "index" | "live" | "snapshot";

export interface GranolaAppDocumentsState {
  count: number;
  loaded: boolean;
  loadedAt?: string;
  source?: Extract<GranolaCatalogSource, "live" | "snapshot">;
}

export interface GranolaAppFoldersState {
  count: number;
  loaded: boolean;
  loadedAt?: string;
  source?: Extract<GranolaCatalogSource, "documents" | "index" | "live" | "snapshot">;
}

export interface GranolaAppCacheState {
  configured: boolean;
  documentCount: number;
  filePath?: string;
  loaded: boolean;
  loadedAt?: string;
  source?: Extract<GranolaCatalogSource, "file" | "snapshot">;
  transcriptCount: number;
}

export interface GranolaAppIndexState {
  available: boolean;
  filePath?: string;
  loaded: boolean;
  loadedAt?: string;
  meetingCount: number;
}

export interface GranolaAppSyncChange {
  kind: GranolaSyncChangeKind;
  meetingId: string;
  previousUpdatedAt?: string;
  title: string;
  updatedAt?: string;
}

export interface GranolaAppSyncSummary {
  changedCount: number;
  createdCount: number;
  folderCount: number;
  meetingCount: number;
  removedCount: number;
  transcriptReadyCount: number;
}

export interface GranolaAppSyncState {
  eventCount: number;
  eventsFile?: string;
  filePath?: string;
  lastChanges: GranolaAppSyncChange[];
  lastCompletedAt?: string;
  lastError?: string;
  lastFailedAt?: string;
  lastRunId?: string;
  lastStartedAt?: string;
  recentRuns?: GranolaAppSyncRun[];
  running: boolean;
  summary?: GranolaAppSyncSummary;
}

export interface GranolaAppSyncRun {
  changeCount: number;
  changes: GranolaAppSyncChange[];
  completedAt?: string;
  error?: string;
  failedAt?: string;
  id: string;
  startedAt: string;
  status: "failed" | "succeeded";
  summary?: GranolaAppSyncSummary;
}

export interface GranolaAppSyncEvent {
  folders: FolderSummaryRecord[];
  id: string;
  kind: GranolaSyncEventKind;
  meetingId: string;
  occurredAt: string;
  previousUpdatedAt?: string;
  runId: string;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
  updatedAt?: string;
}

export interface GranolaYazdSourceInfo {
  description?: string;
  id: string;
  label: string;
  product: "gran";
}

export interface GranolaYazdSourceListOptions {
  cursor?: string;
  folderId?: string;
  limit?: number;
  search?: string;
  since?: string;
}

export interface GranolaYazdSourceItemSummary {
  folderIds: string[];
  folderNames: string[];
  id: string;
  kind: "meeting";
  summary?: string;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
  transcriptSegmentCount: number;
  updatedAt?: string;
}

export interface GranolaYazdSourceListResult {
  items: GranolaYazdSourceItemSummary[];
  nextCursor?: string;
  source: MeetingSummarySource;
}

export interface GranolaYazdSourceFetchResult {
  item: GranolaYazdSourceItemSummary;
  markdown?: string;
  metadata?: Record<string, unknown>;
  text?: string;
}

export interface GranolaYazdArtifact {
  id: string;
  kind: "action-item" | "decision" | "entity" | "note" | "transcript";
  markdown?: string;
  metadata?: Record<string, unknown>;
  provenance: {
    actionId?: string;
    artefactId?: string;
    capturedAt: string;
    model?: string;
    provider?: GranolaAgentProviderKind;
    reviewStatus: "approved" | "generated" | "rejected";
    ruleId?: string;
    sourceId: string;
    sourceKind: string;
    sourceUpdatedAt?: string;
  };
  text?: string;
  title: string;
}

export interface GranolaYazdArtifactBundle {
  artifacts: GranolaYazdArtifact[];
  metadata?: Record<string, unknown>;
  sourceItemId: string;
  sourcePluginId: string;
  tags?: string[];
  title: string;
  updatedAt?: string;
}

export interface GranolaYazdSourceChange {
  happenedAt?: string;
  id: string;
  itemId: string;
  kind: "created" | "deleted" | "transcript-ready" | "updated";
  title?: string;
}

export interface GranolaYazdSourceChangesResult {
  changes: GranolaYazdSourceChange[];
  nextCursor?: string;
}

export type GranolaYazdKnowledgeBaseKind =
  | "capacities"
  | "folder"
  | "notion"
  | "obsidian-vault"
  | "tana";
export type GranolaYazdPublishAction = "delete" | "noop" | "update" | "write";

export interface GranolaYazdKnowledgeBaseRef {
  id: string;
  kind: GranolaYazdKnowledgeBaseKind;
  label?: string;
  rootDir: string;
  settings?: {
    dailyNotesDir?: string;
    filenameTemplate?: string;
    folderSubdirectories?: boolean;
    frontmatter?: boolean;
    notesSubdir?: string;
    transcriptsSubdir?: string;
    vaultName?: string;
  };
}

export interface GranolaYazdPublishPlanEntry {
  action: GranolaYazdPublishAction;
  artifactId: string;
  artifactKind: GranolaYazdArtifact["kind"] | "daily-note";
  openUrl?: string;
  path: string;
  reason?: string;
}

export interface GranolaYazdKnowledgeBasePublishInput {
  bundle: GranolaYazdArtifactBundle;
  knowledgeBase: GranolaYazdKnowledgeBaseRef;
}

export interface GranolaYazdKnowledgeBasePublishPreview extends GranolaYazdKnowledgeBaseRef {
  entries: GranolaYazdPublishPlanEntry[];
}

export interface GranolaYazdKnowledgeBasePublishResult extends GranolaYazdKnowledgeBasePublishPreview {
  publishedAt: string;
  writtenCount: number;
}

export interface GranolaAutomationRuleWhen extends Omit<
  YazdWorkflowWhen,
  "eventKinds" | "itemIds" | "itemKinds" | "sourcePluginIds"
> {
  eventKinds?: GranolaSyncEventKind[];
  folderIds?: string[];
  folderNames?: string[];
  meetingIds?: string[];
  titleMatches?: string;
  transcriptLoaded?: boolean;
}

interface GranolaAutomationBaseAction extends YazdWorkflowActionBase {
  kind: GranolaAutomationActionKind;
}

interface GranolaAutomationTriggeredAction
  extends Omit<YazdTriggeredWorkflowAction, "kind">, GranolaAutomationBaseAction {}

export type GranolaAutomationAskUserAction = YazdAskUserWorkflowAction;

export interface GranolaAutomationAgentAction extends GranolaAutomationBaseAction {
  approvalMode?: GranolaAutomationApprovalMode;
  cwd?: string;
  dryRun?: boolean;
  fallbackHarnessIds?: string[];
  harnessId?: string;
  kind: "agent";
  model?: string;
  pipeline?: GranolaAutomationPipelineConfig;
  prompt?: string;
  promptFile?: string;
  provider?: GranolaAgentProviderKind;
  retries?: number;
  systemPrompt?: string;
  systemPromptFile?: string;
  timeoutMs?: number;
}

export interface GranolaAutomationPipelineConfig {
  kind: GranolaAutomationArtefactKind;
}

export type GranolaAutomationCommandAction = YazdCommandWorkflowAction;

export interface GranolaAutomationExportNotesAction extends GranolaAutomationBaseAction {
  format?: NoteOutputFormat;
  kind: "export-notes";
  outputDir?: string;
  scopedOutput?: boolean;
}

export interface GranolaAutomationExportTranscriptAction extends GranolaAutomationBaseAction {
  format?: TranscriptOutputFormat;
  kind: "export-transcript";
  outputDir?: string;
  scopedOutput?: boolean;
}

export type GranolaAutomationWebhookAction = YazdWebhookWorkflowAction;

export type GranolaAutomationSlackMessageAction = YazdSlackMessageWorkflowAction;

export type GranolaAutomationWriteFileAction = YazdWriteFileWorkflowAction;

export interface GranolaAutomationPkmSyncAction extends GranolaAutomationTriggeredAction {
  kind: "pkm-sync";
  targetId: string;
}

export interface GranolaPkmTarget {
  dailyNotesDir?: string;
  filenameTemplate?: string;
  folderSubdirectories?: boolean;
  frontmatter?: boolean;
  id: string;
  kind: GranolaPkmTargetKind;
  name?: string;
  notesSubdir?: string;
  outputDir: string;
  reviewMode?: GranolaPkmTargetReviewMode;
  transcriptsSubdir?: string;
  vaultName?: string;
}

export interface GranolaExportTarget {
  dailyNotesDir?: string;
  id: string;
  kind: GranolaExportTargetKind;
  name?: string;
  notesFormat?: NoteOutputFormat;
  notesSubdir?: string;
  outputDir: string;
  transcriptsFormat?: TranscriptOutputFormat;
  transcriptsSubdir?: string;
}

export type GranolaAutomationAction =
  | GranolaAutomationAgentAction
  | GranolaAutomationAskUserAction
  | GranolaAutomationCommandAction
  | GranolaAutomationExportNotesAction
  | GranolaAutomationExportTranscriptAction
  | GranolaAutomationPkmSyncAction
  | GranolaAutomationWebhookAction
  | GranolaAutomationSlackMessageAction
  | GranolaAutomationWriteFileAction;

export interface GranolaAutomationRule extends Omit<YazdWorkflowDefinition, "actions" | "when"> {
  actions?: GranolaAutomationAction[];
  when: GranolaAutomationRuleWhen;
}

export interface GranolaAutomationMatch {
  eventId: string;
  eventKind: GranolaSyncEventKind;
  folders: FolderSummaryRecord[];
  id: string;
  matchedAt: string;
  meetingId: string;
  ruleId: string;
  ruleName: string;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
}

export interface GranolaAutomationActionRun extends YazdWorkflowRun<Record<string, unknown>> {
  actionId: string;
  actionKind: GranolaAutomationActionKind;
  actionName: string;
  artefactIds?: string[];
  eventId: string;
  eventKind: GranolaSyncEventKind;
  folders: FolderSummaryRecord[];
  matchId: string;
  matchedAt: string;
  meetingId: string;
  rerunOfId?: string;
  ruleId: string;
  ruleName: string;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
}

export type GranolaAutomationArtefactSection = YazdStructuredSection;
export type GranolaAutomationArtefactActionItem =
  YazdStructuredActionItem<GranolaMeetingSpeakerRole>;
export type GranolaAutomationArtefactParticipantSummary =
  YazdStructuredParticipantSummary<GranolaMeetingSpeakerRole>;
export type GranolaAutomationArtefactStructuredOutput =
  YazdStructuredOutput<GranolaMeetingSpeakerRole>;

export interface GranolaAutomationArtefactAttempt {
  error?: string;
  harnessId?: string;
  model?: string;
  provider?: GranolaAgentProviderKind;
}

export type GranolaAutomationArtefactHistoryEntry = YazdArtefactHistoryEntry;

export interface GranolaAutomationArtefact {
  actionId: string;
  actionName: string;
  attempts: GranolaAutomationArtefactAttempt[];
  createdAt: string;
  eventId: string;
  history: GranolaAutomationArtefactHistoryEntry[];
  id: string;
  kind: GranolaAutomationArtefactKind;
  matchId: string;
  meetingId: string;
  model: string;
  parseMode: "json" | "markdown-fallback";
  prompt: string;
  provider: GranolaAgentProviderKind;
  rawOutput: string;
  rerunOfId?: string;
  ruleId: string;
  ruleName: string;
  runId: string;
  status: GranolaAutomationArtefactStatus;
  structured: GranolaAutomationArtefactStructuredOutput;
  supersededById?: string;
  updatedAt: string;
}

export interface GranolaAppAutomationState {
  artefactCount: number;
  artefactsFile?: string;
  lastRunAt?: string;
  lastMatchedAt?: string;
  loaded: boolean;
  matchCount: number;
  matchesFile?: string;
  pendingArtefactCount: number;
  pendingRunCount: number;
  ruleCount: number;
  rulesFile?: string;
  runCount: number;
  runsFile?: string;
}

export type GranolaAppPluginId = string;

export interface GranolaAppPluginState {
  capabilities: GranolaPluginCapability[];
  configurable: boolean;
  description: string;
  enabled: boolean;
  id: GranolaAppPluginId;
  label: string;
  settingsContributions?: GranolaPluginSettingsContribution[];
  shipped: boolean;
  statusDetails?: {
    disabled: string;
    enabled: string;
  };
}

export interface GranolaAppPluginsState {
  items: GranolaAppPluginState[];
  loaded: boolean;
}

export interface GranolaAppPluginsResult {
  plugins: GranolaAppPluginState[];
}

export interface GranolaExportTargetsResult {
  targets: GranolaExportTarget[];
}

export interface GranolaPkmTargetsResult {
  targets: GranolaPkmTarget[];
}

export interface GranolaAppExportRunState {
  format: string;
  itemCount: number;
  jobId: string;
  outputDir: string;
  ranAt: string;
  scope: GranolaExportScope;
  targetId?: string;
  written: number;
}

export interface GranolaAppExportJobState {
  completedCount: number;
  error?: string;
  finishedAt?: string;
  format: string;
  id: string;
  itemCount: number;
  kind: GranolaExportJobKind;
  outputDir: string;
  scopedOutput?: boolean;
  scope: GranolaExportScope;
  startedAt: string;
  status: GranolaExportJobStatus;
  targetId?: string;
  written: number;
}

export interface GranolaAppUIState {
  surface: GranolaAppSurface;
}

export interface GranolaAppState {
  auth: GranolaAppAuthState;
  automation: GranolaAppAutomationState;
  cache: GranolaAppCacheState;
  config: AppConfig;
  documents: GranolaAppDocumentsState;
  folders: GranolaAppFoldersState;
  exports: {
    jobs: GranolaAppExportJobState[];
    notes?: GranolaAppExportRunState;
    transcripts?: GranolaAppExportRunState;
  };
  index: GranolaAppIndexState;
  plugins: GranolaAppPluginsState;
  sync: GranolaAppSyncState;
  ui: GranolaAppUIState;
}

export interface GranolaMeetingBundle {
  meeting: MeetingRecord;
  source: GranolaMeetingSourceRecord;
}

export interface GranolaMeetingSourceRecord {
  cacheDocument?: CacheDocument;
  document: GranolaDocument;
}

export type { MeetingRoleHelpersRecord };

export interface GranolaMeetingListOptions {
  folderId?: string;
  forceRefresh?: boolean;
  limit?: number;
  preferIndex?: boolean;
  search?: string;
  sort?: GranolaMeetingSort;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface GranolaFolderListOptions {
  forceRefresh?: boolean;
  limit?: number;
  search?: string;
}

export interface GranolaNotesExportResult {
  documentCount: number;
  documents: GranolaDocument[];
  format: NoteOutputFormat;
  job: GranolaAppExportJobState;
  outputDir: string;
  scope: GranolaExportScope;
  targetId?: string;
  written: number;
}

export interface GranolaTranscriptsExportResult {
  cacheData: CacheData;
  format: TranscriptOutputFormat;
  job: GranolaAppExportJobState;
  outputDir: string;
  scope: GranolaExportScope;
  targetId?: string;
  transcriptCount: number;
  written: number;
}

export interface GranolaExportRunOptions {
  folderId?: string;
  outputDir?: string;
  scopedOutput?: boolean;
  targetId?: string;
}

export interface GranolaMeetingListResult {
  meetings: MeetingSummaryRecord[];
  source: MeetingSummarySource;
}

export interface GranolaFolderListResult {
  folders: FolderSummaryRecord[];
}

export interface GranolaExportJobsListOptions {
  limit?: number;
}

export interface GranolaExportJobsResult {
  jobs: GranolaAppExportJobState[];
}

export interface GranolaAppSyncResult {
  changes: GranolaAppSyncChange[];
  state: GranolaAppSyncState;
  summary: GranolaAppSyncSummary;
}

export interface GranolaAppSyncEventsResult {
  events: GranolaAppSyncEvent[];
}

export interface GranolaAutomationRulesResult {
  rules: GranolaAutomationRule[];
}

export interface GranolaAutomationMatchesResult {
  matches: GranolaAutomationMatch[];
}

export interface GranolaAutomationRunsResult {
  runs: GranolaAutomationActionRun[];
}

export interface GranolaAutomationArtefactsResult {
  artefacts: GranolaAutomationArtefact[];
}

export interface GranolaPkmPublishPreview {
  dailyNoteFilePath?: string;
  dailyNoteOpenUrl?: string;
  noteFilePath: string;
  noteOpenUrl?: string;
  transcriptFilePath?: string;
  transcriptOpenUrl?: string;
}

export interface GranolaAutomationArtefactPublishPreviewResult {
  artefactId: string;
  message?: string;
  preview?: GranolaPkmPublishPreview;
  selectedTargetId?: string;
  targets: GranolaPkmTarget[];
}

export interface GranolaAgentHarnessesResult {
  harnesses: GranolaAgentHarness[];
}

export interface GranolaAgentHarnessExplanationsResult {
  eventKind: GranolaSyncEventKind;
  harnesses: GranolaAgentHarnessMatchExplanation[];
  meetingId: string;
  meetingTitle: string;
}

export interface GranolaAutomationEvaluationCase {
  bundle: GranolaMeetingBundle;
  id: string;
  title: string;
}

export interface GranolaAutomationEvaluationRun {
  caseId: string;
  caseTitle: string;
  error?: string;
  harnessId?: string;
  harnessName?: string;
  model?: string;
  parseMode?: GranolaAutomationArtefact["parseMode"];
  prompt: string;
  provider?: GranolaAgentProviderKind;
  rawOutput?: string;
  status: "completed" | "failed";
  structured?: GranolaAutomationArtefactStructuredOutput;
}

export interface GranolaAutomationEvaluationResult {
  generatedAt: string;
  kind: GranolaAutomationArtefactKind;
  results: GranolaAutomationEvaluationRun[];
}

export interface GranolaAutomationArtefactListOptions {
  kind?: GranolaAutomationArtefactKind;
  limit?: number;
  meetingId?: string;
  status?: GranolaAutomationArtefactStatus;
}

export interface GranolaAutomationArtefactUpdate {
  markdown?: string;
  note?: string;
  summary?: string;
  title?: string;
}

export interface GranolaProcessingIssue extends YazdReviewIssue {
  actionId?: string;
  kind: GranolaProcessingIssueKind;
  meetingId?: string;
  ruleId?: string;
}

export interface GranolaProcessingIssuesResult {
  issues: GranolaProcessingIssue[];
}

export interface GranolaProcessingRecoveryResult {
  issue: GranolaProcessingIssue;
  recoveredAt: string;
  runCount: number;
  syncRan: boolean;
}

export interface GranolaAppStateEvent {
  state: GranolaAppState;
  timestamp: string;
  type: "state.updated";
}

export type GranolaExportJobRunResult = GranolaNotesExportResult | GranolaTranscriptsExportResult;

export interface GranolaAppApi {
  getState(): GranolaAppState;
  subscribe(listener: (event: GranolaAppStateEvent) => void): () => void;
  inspectAuth(): Promise<GranolaAppAuthState>;
  inspectYazdSource(): Promise<GranolaYazdSourceInfo>;
  listYazdSourceItems(options?: GranolaYazdSourceListOptions): Promise<GranolaYazdSourceListResult>;
  fetchYazdSourceItem(id: string): Promise<GranolaYazdSourceFetchResult>;
  buildYazdSourceArtifacts(id: string): Promise<GranolaYazdArtifactBundle>;
  listYazdSourceChanges(options?: {
    cursor?: string;
    limit?: number;
    since?: string;
  }): Promise<GranolaYazdSourceChangesResult>;
  listPlugins(): Promise<GranolaAppPluginsResult>;
  setPluginEnabled(id: GranolaAppPluginId, enabled: boolean): Promise<GranolaAppPluginState>;
  listAgentHarnesses(): Promise<GranolaAgentHarnessesResult>;
  saveAgentHarnesses(harnesses: GranolaAgentHarness[]): Promise<GranolaAgentHarnessesResult>;
  explainAgentHarnesses(meetingId: string): Promise<GranolaAgentHarnessExplanationsResult>;
  getAutomationArtefact(id: string): Promise<GranolaAutomationArtefact>;
  listAutomationArtefacts(
    options?: GranolaAutomationArtefactListOptions,
  ): Promise<GranolaAutomationArtefactsResult>;
  evaluateAutomationCases(
    cases: GranolaAutomationEvaluationCase[],
    options?: {
      dryRun?: boolean;
      harnessIds?: string[];
      kind?: GranolaAutomationArtefactKind;
      model?: string;
      provider?: GranolaAgentProviderKind;
    },
  ): Promise<GranolaAutomationEvaluationResult>;
  listProcessingIssues(options?: {
    limit?: number;
    meetingId?: string;
    severity?: GranolaProcessingIssueSeverity;
  }): Promise<GranolaProcessingIssuesResult>;
  listAutomationMatches(options?: { limit?: number }): Promise<GranolaAutomationMatchesResult>;
  listAutomationRuns(options?: {
    limit?: number;
    status?: GranolaAutomationActionRunStatus;
  }): Promise<GranolaAutomationRunsResult>;
  listAutomationRules(): Promise<GranolaAutomationRulesResult>;
  saveAutomationRules(rules: GranolaAutomationRule[]): Promise<GranolaAutomationRulesResult>;
  listSyncEvents(options?: { limit?: number }): Promise<GranolaAppSyncEventsResult>;
  inspectSync(): Promise<GranolaAppSyncState>;
  clearApiKeyAuth(): Promise<GranolaAppAuthState>;
  loginAuth(options?: { apiKey?: string; supabasePath?: string }): Promise<GranolaAppAuthState>;
  logoutAuth(): Promise<GranolaAppAuthState>;
  recoverProcessingIssue(id: string): Promise<GranolaProcessingRecoveryResult>;
  listPkmTargets(): Promise<GranolaPkmTargetsResult>;
  previewAutomationArtefactPublish(
    id: string,
    options?: { targetId?: string },
  ): Promise<GranolaAutomationArtefactPublishPreviewResult>;
  resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options?: { note?: string; targetId?: string },
  ): Promise<GranolaAutomationArtefact>;
  resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options?: { note?: string },
  ): Promise<GranolaAutomationActionRun>;
  rerunAutomationArtefact(id: string): Promise<GranolaAutomationArtefact>;
  refreshAuth(): Promise<GranolaAppAuthState>;
  switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState>;
  sync(options?: { forceRefresh?: boolean; foreground?: boolean }): Promise<GranolaAppSyncResult>;
  updateAutomationArtefact(
    id: string,
    patch: GranolaAutomationArtefactUpdate,
  ): Promise<GranolaAutomationArtefact>;
  listFolders(options?: GranolaFolderListOptions): Promise<GranolaFolderListResult>;
  getFolder(id: string): Promise<FolderRecord>;
  findFolder(query: string): Promise<FolderRecord>;
  listMeetings(options?: GranolaMeetingListOptions): Promise<GranolaMeetingListResult>;
  getMeeting(id: string, options?: { requireCache?: boolean }): Promise<GranolaMeetingBundle>;
  findMeeting(query: string, options?: { requireCache?: boolean }): Promise<GranolaMeetingBundle>;
  listExportJobs(options?: GranolaExportJobsListOptions): Promise<GranolaExportJobsResult>;
  listExportTargets(): Promise<GranolaExportTargetsResult>;
  saveExportTargets(targets: GranolaExportTarget[]): Promise<GranolaExportTargetsResult>;
  exportNotes(
    format?: NoteOutputFormat,
    options?: GranolaExportRunOptions,
  ): Promise<GranolaNotesExportResult>;
  exportTranscripts(
    format?: TranscriptOutputFormat,
    options?: GranolaExportRunOptions,
  ): Promise<GranolaTranscriptsExportResult>;
  rerunExportJob(id: string): Promise<GranolaExportJobRunResult>;
}
