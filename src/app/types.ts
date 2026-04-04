import type {
  FolderRecord,
  FolderSummaryRecord,
  GranolaSessionMetadata,
  MeetingRecord,
  MeetingSummarySource,
  MeetingSummaryRecord,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "./models.ts";
import type { AppConfig, CacheData, GranolaDocument } from "../types.ts";

export type GranolaAppAuthMode = GranolaSessionMetadata["mode"];
export type GranolaAppSurface = "cli" | "server" | "tui" | "web";
export type GranolaMeetingSort = "title-asc" | "title-desc" | "updated-asc" | "updated-desc";
export type GranolaExportJobKind = "notes" | "transcripts";
export type GranolaExportJobStatus = "completed" | "failed" | "running";
export type GranolaSyncChangeKind = "changed" | "created" | "removed" | "transcript-ready";
export type GranolaSyncEventKind =
  | "meeting.changed"
  | "meeting.created"
  | "meeting.removed"
  | "transcript.ready";
export type GranolaAutomationActionKind =
  | "ask-user"
  | "command"
  | "export-notes"
  | "export-transcript";
export type GranolaAutomationActionRunStatus = "completed" | "failed" | "pending" | "skipped";
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

export interface GranolaAutomationCommandAction {
  args?: string[];
  command: string;
  cwd?: string;
  enabled?: boolean;
  env?: Record<string, string>;
  id: string;
  kind: "command";
  name?: string;
  stdin?: "json" | "none";
  timeoutMs?: number;
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

export type GranolaAutomationAction =
  | GranolaAutomationAskUserAction
  | GranolaAutomationCommandAction
  | GranolaAutomationExportNotesAction
  | GranolaAutomationExportTranscriptAction;

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
  error?: string;
  eventId: string;
  eventKind: GranolaSyncEventKind;
  folders: FolderSummaryRecord[];
  finishedAt?: string;
  id: string;
  matchedAt: string;
  meetingId: string;
  meta?: Record<string, unknown>;
  prompt?: string;
  result?: string;
  ruleId: string;
  ruleName: string;
  startedAt: string;
  status: GranolaAutomationActionRunStatus;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
}

export interface GranolaAppAutomationState {
  lastRunAt?: string;
  lastMatchedAt?: string;
  loaded: boolean;
  matchCount: number;
  matchesFile?: string;
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
  resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options?: { note?: string },
  ): Promise<GranolaAutomationActionRun>;
  refreshAuth(): Promise<GranolaAppAuthState>;
  switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState>;
  sync(options?: { forceRefresh?: boolean; foreground?: boolean }): Promise<GranolaAppSyncResult>;
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
