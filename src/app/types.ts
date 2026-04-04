import type {
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
export type GranolaAppView =
  | "auth"
  | "idle"
  | "exports-history"
  | "meeting-detail"
  | "meeting-list"
  | "notes-export"
  | "transcripts-export";

export interface GranolaAppAuthState extends GranolaSessionMetadata {}

export interface GranolaAppDocumentsState {
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

export interface GranolaAppExportRunState {
  format: string;
  itemCount: number;
  jobId: string;
  outputDir: string;
  ranAt: string;
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
  startedAt: string;
  status: GranolaExportJobStatus;
  written: number;
}

export interface GranolaAppUIState {
  meetingSearch?: string;
  meetingListSource?: MeetingSummarySource;
  meetingSort?: GranolaMeetingSort;
  meetingUpdatedFrom?: string;
  meetingUpdatedTo?: string;
  selectedMeetingId?: string;
  surface: GranolaAppSurface;
  view: GranolaAppView;
}

export interface GranolaAppState {
  auth: GranolaAppAuthState;
  cache: GranolaAppCacheState;
  config: AppConfig;
  documents: GranolaAppDocumentsState;
  exports: {
    jobs: GranolaAppExportJobState[];
    notes?: GranolaAppExportRunState;
    transcripts?: GranolaAppExportRunState;
  };
  index: GranolaAppIndexState;
  ui: GranolaAppUIState;
}

export interface GranolaMeetingBundle {
  cacheData?: CacheData;
  document: GranolaDocument;
  meeting: MeetingRecord;
}

export interface GranolaMeetingListOptions {
  forceRefresh?: boolean;
  limit?: number;
  preferIndex?: boolean;
  search?: string;
  sort?: GranolaMeetingSort;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface GranolaNotesExportResult {
  documentCount: number;
  documents: GranolaDocument[];
  format: NoteOutputFormat;
  job: GranolaAppExportJobState;
  outputDir: string;
  written: number;
}

export interface GranolaTranscriptsExportResult {
  cacheData: CacheData;
  format: TranscriptOutputFormat;
  job: GranolaAppExportJobState;
  outputDir: string;
  transcriptCount: number;
  written: number;
}

export interface GranolaMeetingListResult {
  meetings: MeetingSummaryRecord[];
  source: MeetingSummarySource;
}

export interface GranolaExportJobsListOptions {
  limit?: number;
}

export interface GranolaExportJobsResult {
  jobs: GranolaAppExportJobState[];
}

export interface GranolaAppStateEvent {
  state: GranolaAppState;
  timestamp: string;
  type: "state.updated";
}
