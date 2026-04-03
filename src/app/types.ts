import type { MeetingRecord, MeetingSummaryRecord } from "../meetings.ts";
import type {
  AppConfig,
  CacheData,
  GranolaDocument,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../types.ts";

export type GranolaAppAuthMode = "stored-session" | "supabase-file";
export type GranolaAppSurface = "cli" | "server" | "tui" | "web";
export type GranolaAppView =
  | "idle"
  | "meeting-detail"
  | "meeting-list"
  | "notes-export"
  | "transcripts-export";

export interface GranolaAppAuthState {
  mode: GranolaAppAuthMode;
  storedSessionAvailable: boolean;
  supabasePath?: string;
}

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

export interface GranolaAppExportRunState {
  format: string;
  itemCount: number;
  outputDir: string;
  ranAt: string;
  written: number;
}

export interface GranolaAppUIState {
  meetingSearch?: string;
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
    notes?: GranolaAppExportRunState;
    transcripts?: GranolaAppExportRunState;
  };
  ui: GranolaAppUIState;
}

export interface GranolaMeetingBundle {
  cacheData?: CacheData;
  document: GranolaDocument;
  meeting: MeetingRecord;
}

export interface GranolaMeetingListOptions {
  limit?: number;
  search?: string;
}

export interface GranolaNotesExportResult {
  documentCount: number;
  documents: GranolaDocument[];
  format: NoteOutputFormat;
  outputDir: string;
  written: number;
}

export interface GranolaTranscriptsExportResult {
  cacheData: CacheData;
  format: TranscriptOutputFormat;
  outputDir: string;
  transcriptCount: number;
  written: number;
}

export interface GranolaMeetingListResult {
  format?: "json" | "text" | "yaml";
  meetings: MeetingSummaryRecord[];
}
