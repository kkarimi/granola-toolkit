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
export type GranolaExportScope =
  | {
      mode: "all";
    }
  | {
      folderId: string;
      folderName: string;
      mode: "folder";
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
  filePath?: string;
  lastChanges: GranolaAppSyncChange[];
  lastCompletedAt?: string;
  lastError?: string;
  lastFailedAt?: string;
  lastStartedAt?: string;
  running: boolean;
  summary?: GranolaAppSyncSummary;
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
  inspectSync(): Promise<GranolaAppSyncState>;
  loginAuth(options?: { supabasePath?: string }): Promise<GranolaAppAuthState>;
  logoutAuth(): Promise<GranolaAppAuthState>;
  refreshAuth(): Promise<GranolaAppAuthState>;
  switchAuthMode(mode: GranolaAppAuthMode): Promise<GranolaAppAuthState>;
  sync(options?: { forceRefresh?: boolean }): Promise<GranolaAppSyncResult>;
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
