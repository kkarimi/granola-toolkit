import type { GranolaPluginEnabledSource } from "./plugin-registry.ts";

export interface ProseMirrorMark {
  attrs?: Record<string, unknown>;
  type: string;
}

export interface ProseMirrorNode {
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: ProseMirrorMark[];
  text?: string;
  type: string;
}

export interface ProseMirrorDoc {
  content?: ProseMirrorNode[];
  type: string;
}

export interface LastViewedPanel {
  affinityNoteId?: string;
  content?: ProseMirrorDoc;
  contentUpdatedAt?: string;
  createdAt?: string;
  deletedAt?: string;
  documentId?: string;
  generatedLines?: unknown[];
  id?: string;
  lastViewedAt?: string;
  originalContent?: string;
  suggestedQuestions?: unknown;
  templateSlug?: string;
  title?: string;
  updatedAt?: string;
}

export interface GranolaCalendarEvent {
  calendarId?: string;
  endTime?: string;
  htmlLink?: string;
  id?: string;
  recurringEventId?: string;
  startTime?: string;
  url?: string;
}

export interface GranolaMeetingPerson {
  companyName?: string;
  email?: string;
  name?: string;
  title?: string;
}

export interface GranolaMeetingPeople {
  attendees: GranolaMeetingPerson[];
  creator?: GranolaMeetingPerson;
}

export type GranEventHookKind = "script" | "webhook";

export interface GranEventHookBase {
  events?: string[];
  id: string;
  kind: GranEventHookKind;
}

export interface GranEventScriptHook extends GranEventHookBase {
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  kind: "script";
  run: string;
}

export interface GranEventWebhookHook extends GranEventHookBase {
  headers?: Record<string, string>;
  kind: "webhook";
  url: string;
}

export type GranEventHook = GranEventScriptHook | GranEventWebhookHook;

export interface GranolaDocument {
  calendarEvent?: GranolaCalendarEvent;
  content: string;
  createdAt: string;
  folderMemberships?: GranolaFolderMembership[];
  id: string;
  lastViewedPanel?: LastViewedPanel;
  notes?: ProseMirrorDoc;
  notesPlain: string;
  people?: GranolaMeetingPeople;
  tags: string[];
  title: string;
  transcriptSegments?: TranscriptSegment[];
  updatedAt: string;
}

export interface GranolaFolder {
  createdAt: string;
  description?: string;
  documentIds: string[];
  id: string;
  isFavourite: boolean;
  name: string;
  updatedAt: string;
  workspaceId?: string;
}

export interface GranolaFolderMembership {
  id: string;
  name: string;
}

export interface TranscriptSegment {
  documentId: string;
  endTimestamp: string;
  id: string;
  isFinal: boolean;
  source: string;
  startTimestamp: string;
  text: string;
}

export interface CacheDocument {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
}

export interface CacheData {
  documents: Record<string, CacheDocument>;
  transcripts: Record<string, TranscriptSegment[]>;
}

export type ExportStateKind = "notes" | "transcripts";

export interface ExportStateEntry {
  contentHash: string;
  exportedAt: string;
  fileName: string;
  fileStem: string;
  sourceUpdatedAt: string;
}

export interface ExportStateFile {
  entries: Record<string, ExportStateEntry>;
  kind: ExportStateKind;
  version: number;
}

export interface NotesOptions {
  output: string;
  timeoutMs: number;
}

export interface TranscriptOptions {
  cacheFile: string;
  output: string;
}

export type GranolaAgentProviderKind = "codex" | "openai" | "openrouter";

export interface GranolaAgentsOptions {
  codexCommand: string;
  defaultModel?: string;
  defaultProvider?: GranolaAgentProviderKind;
  dryRun: boolean;
  harnessesFile: string;
  maxRetries: number;
  openaiBaseUrl: string;
  openrouterBaseUrl: string;
  timeoutMs: number;
}

export interface AppConfig {
  automation?: {
    artefactsFile: string;
    pkmTargetsFile?: string;
    rulesFile: string;
  };
  agents?: GranolaAgentsOptions;
  apiKey?: string;
  configFileUsed?: string;
  debug: boolean;
  exports?: {
    targetsFile: string;
  };
  hooks?: {
    items: GranEventHook[];
  };
  notes: NotesOptions;
  plugins?: {
    enabled: Record<string, boolean>;
    sources?: Record<string, GranolaPluginEnabledSource>;
    settingsFile: string;
  };
  supabase?: string;
  transcripts: TranscriptOptions;
}

export type {
  NoteContentSource,
  NoteExportRecord,
  NoteOutputFormat,
  TranscriptExportRecord,
  TranscriptExportSegmentRecord,
  TranscriptOutputFormat,
} from "./app/models.ts";
