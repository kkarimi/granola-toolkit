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
import type { AppConfig, CacheData, GranolaDocument, GranolaAgentProviderKind } from "../types.ts";

export type GranolaAppAuthMode = GranolaSessionMetadata["mode"];
export type GranolaAppSurface = "cli" | "server" | "tui" | "web";
export type GranolaMeetingSort = "title-asc" | "title-desc" | "updated-asc" | "updated-desc";
export type GranolaExportJobKind = "notes" | "transcripts";
export type GranolaExportJobStatus = "completed" | "failed" | "running";
export type GranolaSyncChangeKind = "changed" | "created" | "removed" | "transcript-ready";
export type GranolaAutomationArtefactKind = "enrichment" | "notes";
export type GranolaAutomationArtefactHistoryAction =
  | "approved"
  | "edited"
  | "generated"
  | "rejected"
  | "rerun";
export type GranolaAutomationArtefactStatus = "approved" | "generated" | "rejected" | "superseded";
export type GranolaAutomationActionTrigger = "approval" | "match";
export type GranolaAutomationApprovalMode = "auto" | "manual";
export type GranolaProcessingIssueKind =
  | "artefact-stale"
  | "pipeline-failed"
  | "pipeline-missing"
  | "sync-stale"
  | "transcript-missing";
export type GranolaProcessingIssueSeverity = "error" | "warning";
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
export type GranolaAutomationActionRunStatus = "completed" | "failed" | "pending" | "skipped";
export type GranolaAutomationWebhookPayloadFormat = "json" | "markdown" | "text";
export type GranolaAutomationWriteFileFormat = "json" | "markdown" | "text";
export type GranolaPkmTargetKind = "docs-folder" | "obsidian";
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
export type GranolaAppView =
  | "auth"
  | "folder-detail"
  | "folder-list"
  | "idle"
  | "exports-history"
  | "meeting-detail"
  | "meeting-list"
  | "notes-export"
  | "sync"
  | "transcripts-export";

export interface GranolaAppAuthState extends GranolaSessionMetadata {}

export interface GranolaAppDocumentsState {
  count: number;
  loaded: boolean;
  loadedAt?: string;
}

export interface GranolaAppFoldersState {
  count: number;
  loaded: boolean;
  loadedAt?: string;
}

export interface GranolaAppCacheState {
  configured: boolean;
  documentCount: number;
  filePath?: string;
  loaded: boolean;
  loadedAt?: string;
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
  running: boolean;
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

export interface GranolaAutomationRuleWhen {
  eventKinds?: GranolaSyncEventKind[];
  folderIds?: string[];
  folderNames?: string[];
  meetingIds?: string[];
  tags?: string[];
  titleIncludes?: string[];
  titleMatches?: string;
  transcriptLoaded?: boolean;
}

export interface GranolaAutomationAskUserAction {
  details?: string;
  enabled?: boolean;
  id: string;
  kind: "ask-user";
  name?: string;
  prompt: string;
}

export interface GranolaAutomationAgentAction {
  approvalMode?: GranolaAutomationApprovalMode;
  cwd?: string;
  dryRun?: boolean;
  enabled?: boolean;
  fallbackHarnessIds?: string[];
  harnessId?: string;
  id: string;
  kind: "agent";
  model?: string;
  name?: string;
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

export interface GranolaAutomationCommandAction {
  args?: string[];
  command: string;
  cwd?: string;
  enabled?: boolean;
  env?: Record<string, string>;
  id: string;
  kind: "command";
  name?: string;
  sourceActionId?: string;
  stdin?: "json" | "none";
  timeoutMs?: number;
  trigger?: GranolaAutomationActionTrigger;
}

export interface GranolaAutomationExportNotesAction {
  enabled?: boolean;
  format?: NoteOutputFormat;
  id: string;
  kind: "export-notes";
  name?: string;
  outputDir?: string;
  scopedOutput?: boolean;
}

export interface GranolaAutomationExportTranscriptAction {
  enabled?: boolean;
  format?: TranscriptOutputFormat;
  id: string;
  kind: "export-transcript";
  name?: string;
  outputDir?: string;
  scopedOutput?: boolean;
}

export interface GranolaAutomationWebhookAction {
  bodyTemplate?: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  id: string;
  kind: "webhook";
  method?: string;
  name?: string;
  payload?: GranolaAutomationWebhookPayloadFormat;
  sourceActionId?: string;
  trigger?: GranolaAutomationActionTrigger;
  url?: string;
  urlEnv?: string;
}

export interface GranolaAutomationSlackMessageAction {
  enabled?: boolean;
  id: string;
  kind: "slack-message";
  name?: string;
  sourceActionId?: string;
  text?: string;
  trigger?: GranolaAutomationActionTrigger;
  webhookUrl?: string;
  webhookUrlEnv?: string;
}

export interface GranolaAutomationWriteFileAction {
  contentTemplate?: string;
  enabled?: boolean;
  filenameTemplate?: string;
  format?: GranolaAutomationWriteFileFormat;
  id: string;
  kind: "write-file";
  name?: string;
  outputDir: string;
  overwrite?: boolean;
  sourceActionId?: string;
  trigger?: GranolaAutomationActionTrigger;
}

export interface GranolaAutomationPkmSyncAction {
  enabled?: boolean;
  id: string;
  kind: "pkm-sync";
  name?: string;
  sourceActionId?: string;
  targetId: string;
  trigger?: GranolaAutomationActionTrigger;
}

export interface GranolaPkmTarget {
  filenameTemplate?: string;
  folderSubdirectories?: boolean;
  frontmatter?: boolean;
  id: string;
  kind: GranolaPkmTargetKind;
  name?: string;
  outputDir: string;
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

export interface GranolaAutomationRule {
  actions?: GranolaAutomationAction[];
  enabled?: boolean;
  id: string;
  name: string;
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

export interface GranolaAutomationActionRun {
  actionId: string;
  actionKind: GranolaAutomationActionKind;
  actionName: string;
  artefactIds?: string[];
  error?: string;
  eventId: string;
  eventKind: GranolaSyncEventKind;
  folders: FolderSummaryRecord[];
  finishedAt?: string;
  id: string;
  matchId: string;
  matchedAt: string;
  meetingId: string;
  meta?: Record<string, unknown>;
  prompt?: string;
  result?: string;
  rerunOfId?: string;
  ruleId: string;
  ruleName: string;
  startedAt: string;
  status: GranolaAutomationActionRunStatus;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
}

export interface GranolaAutomationArtefactSection {
  body: string;
  title: string;
}

export interface GranolaAutomationArtefactActionItem {
  dueDate?: string;
  owner?: string;
  ownerEmail?: string;
  ownerOriginal?: string;
  ownerRole?: GranolaMeetingSpeakerRole;
  title: string;
}

export interface GranolaAutomationArtefactParticipantSummary {
  actionItems: string[];
  role?: GranolaMeetingSpeakerRole;
  speaker: string;
  summary: string;
}

export interface GranolaAutomationArtefactStructuredOutput {
  actionItems: GranolaAutomationArtefactActionItem[];
  decisions: string[];
  followUps: string[];
  highlights: string[];
  markdown: string;
  metadata?: Record<string, unknown>;
  participantSummaries?: GranolaAutomationArtefactParticipantSummary[];
  sections: GranolaAutomationArtefactSection[];
  summary?: string;
  title: string;
}

export interface GranolaAutomationArtefactAttempt {
  error?: string;
  harnessId?: string;
  model?: string;
  provider?: GranolaAgentProviderKind;
}

export interface GranolaAutomationArtefactHistoryEntry {
  action: GranolaAutomationArtefactHistoryAction;
  at: string;
  note?: string;
}

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

export interface GranolaAppExportRunState {
  format: string;
  itemCount: number;
  jobId: string;
  outputDir: string;
  ranAt: string;
  scope: GranolaExportScope;
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
  scope: GranolaExportScope;
  startedAt: string;
  status: GranolaExportJobStatus;
  written: number;
}

export interface GranolaAppUIState {
  folderSearch?: string;
  meetingSearch?: string;
  meetingListSource?: MeetingSummarySource;
  meetingSort?: GranolaMeetingSort;
  meetingUpdatedFrom?: string;
  meetingUpdatedTo?: string;
  selectedFolderId?: string;
  selectedMeetingId?: string;
  surface: GranolaAppSurface;
  view: GranolaAppView;
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
  sync: GranolaAppSyncState;
  ui: GranolaAppUIState;
}

export interface GranolaMeetingBundle {
  cacheData?: CacheData;
  document: GranolaDocument;
  meeting: MeetingRecord;
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
  written: number;
}

export interface GranolaTranscriptsExportResult {
  cacheData: CacheData;
  format: TranscriptOutputFormat;
  job: GranolaAppExportJobState;
  outputDir: string;
  scope: GranolaExportScope;
  transcriptCount: number;
  written: number;
}

export interface GranolaExportRunOptions {
  folderId?: string;
  outputDir?: string;
  scopedOutput?: boolean;
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

export interface GranolaProcessingIssue {
  actionId?: string;
  detail: string;
  detectedAt: string;
  id: string;
  kind: GranolaProcessingIssueKind;
  meetingId?: string;
  recoverable: boolean;
  ruleId?: string;
  severity: GranolaProcessingIssueSeverity;
  title: string;
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
  getAutomationArtefact(id: string): Promise<GranolaAutomationArtefact>;
  listAutomationArtefacts(
    options?: GranolaAutomationArtefactListOptions,
  ): Promise<GranolaAutomationArtefactsResult>;
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
  listSyncEvents(options?: { limit?: number }): Promise<GranolaAppSyncEventsResult>;
  inspectSync(): Promise<GranolaAppSyncState>;
  loginAuth(options?: { apiKey?: string; supabasePath?: string }): Promise<GranolaAppAuthState>;
  logoutAuth(): Promise<GranolaAppAuthState>;
  recoverProcessingIssue(id: string): Promise<GranolaProcessingRecoveryResult>;
  resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options?: { note?: string },
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
