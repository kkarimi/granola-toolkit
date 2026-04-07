import type { CacheDocument, GranolaDocument, TranscriptSegment } from "../types.ts";

export type NoteContentSource =
  | "notes"
  | "lastViewedPanel.content"
  | "lastViewedPanel.originalContent"
  | "content";

export type NoteOutputFormat = "json" | "markdown" | "raw" | "yaml";

export interface NoteExportRecord {
  content: string;
  contentSource: NoteContentSource;
  createdAt: string;
  id: string;
  raw: GranolaDocument;
  tags: string[];
  title: string;
  updatedAt: string;
}

export type TranscriptOutputFormat = "json" | "raw" | "text" | "yaml";

export interface TranscriptExportSegmentRecord {
  endTimestamp: string;
  id: string;
  isFinal: boolean;
  source: string;
  speaker: string;
  startTimestamp: string;
  text: string;
}

export type GranolaMeetingParticipantRole = "attendee" | "creator";
export type GranolaMeetingSpeakerRole = "attendee" | "creator" | "self" | "system" | "unknown";

export interface MeetingParticipantRecord {
  companyName?: string;
  email?: string;
  id: string;
  label: string;
  role: GranolaMeetingParticipantRole;
  title?: string;
}

export interface MeetingSpeakerRecord {
  firstTimestamp: string;
  id: string;
  label: string;
  lastTimestamp: string;
  matchedParticipantEmail?: string;
  matchedParticipantId?: string;
  matchedParticipantLabel?: string;
  role: GranolaMeetingSpeakerRole;
  segmentCount: number;
  source: string;
  wordCount: number;
}

export interface MeetingOwnerCandidateRecord {
  email?: string;
  id: string;
  label: string;
  role: GranolaMeetingSpeakerRole;
  source: "participant" | "speaker";
}

export interface MeetingRoleHelpersRecord {
  ownerCandidates: MeetingOwnerCandidateRecord[];
  participants: MeetingParticipantRecord[];
  speakers: MeetingSpeakerRecord[];
}

export interface TranscriptExportRecord {
  createdAt: string;
  id: string;
  raw: {
    document: CacheDocument;
    segments: TranscriptSegment[];
  };
  segments: TranscriptExportSegmentRecord[];
  speakers: MeetingSpeakerRecord[];
  title: string;
  updatedAt: string;
}

export interface FolderSummaryRecord {
  createdAt: string;
  description?: string;
  documentCount: number;
  id: string;
  isFavourite: boolean;
  name: string;
  updatedAt: string;
  workspaceId?: string;
}

export interface MeetingSummaryRecord {
  createdAt: string;
  folders: FolderSummaryRecord[];
  id: string;
  noteContentSource: NoteContentSource;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
  transcriptSegmentCount: number;
  updatedAt: string;
}

export type MeetingSummarySource = "index" | "live" | "snapshot";

export interface MeetingNoteRecord {
  content: string;
  contentSource: NoteContentSource;
  createdAt: string;
  id: string;
  tags: string[];
  title: string;
  updatedAt: string;
}

export interface MeetingTranscriptRecord {
  createdAt: string;
  id: string;
  segments: TranscriptExportSegmentRecord[];
  speakers: MeetingSpeakerRecord[];
  title: string;
  updatedAt: string;
}

export interface MeetingRecord {
  meeting: MeetingSummaryRecord;
  note: MeetingNoteRecord;
  noteMarkdown: string;
  roleHelpers: MeetingRoleHelpersRecord;
  transcript: MeetingTranscriptRecord | null;
  transcriptText: string | null;
}

export interface FolderRecord extends FolderSummaryRecord {
  documentIds: string[];
  meetings: MeetingSummaryRecord[];
}

export type GranolaSessionMode = "api-key" | "stored-session" | "supabase-file";

export interface GranolaSessionMetadata {
  apiKeyAvailable?: boolean;
  clientId?: string;
  lastError?: string;
  mode: GranolaSessionMode;
  refreshAvailable: boolean;
  signInMethod?: string;
  storedSessionAvailable: boolean;
  supabaseAvailable: boolean;
  supabasePath?: string;
}
