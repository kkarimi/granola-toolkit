import { buildNoteExport, renderNoteExport } from "./notes.ts";
import { toJson, toYaml } from "./render.ts";
import {
  buildTranscriptExport,
  normaliseTranscriptSegments,
  renderTranscriptExport,
} from "./transcripts.ts";
import type {
  CacheData,
  CacheDocument,
  GranolaDocument,
  NoteContentSource,
  NoteExportRecord,
  TranscriptExportRecord,
  TranscriptExportSegmentRecord,
} from "./types.ts";
import { compareStrings, formatTimestampForTranscript, latestDocumentTimestamp } from "./utils.ts";

export type MeetingListOutputFormat = "json" | "text" | "yaml";
export type MeetingDetailOutputFormat = "json" | "text" | "yaml";
export type MeetingExportOutputFormat = "json" | "yaml";

export interface MeetingSummaryRecord {
  createdAt: string;
  id: string;
  noteContentSource: NoteContentSource;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
  transcriptSegmentCount: number;
  updatedAt: string;
}

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
  title: string;
  updatedAt: string;
}

export interface MeetingRecord {
  meeting: MeetingSummaryRecord;
  note: MeetingNoteRecord;
  noteMarkdown: string;
  transcript: MeetingTranscriptRecord | null;
  transcriptText: string | null;
}

function parseTimestamp(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function compareTimestampsDescending(left: string, right: string): number {
  const leftTimestamp = parseTimestamp(left);
  const rightTimestamp = parseTimestamp(right);

  if (leftTimestamp != null && rightTimestamp != null) {
    return rightTimestamp - leftTimestamp;
  }

  if (leftTimestamp != null) {
    return -1;
  }

  if (rightTimestamp != null) {
    return 1;
  }

  return compareStrings(right, left);
}

function compareMeetingDocuments(left: GranolaDocument, right: GranolaDocument): number {
  return (
    compareTimestampsDescending(latestDocumentTimestamp(left), latestDocumentTimestamp(right)) ||
    compareTimestampsDescending(left.createdAt, right.createdAt) ||
    compareStrings(left.title || left.id, right.title || right.id) ||
    compareStrings(left.id, right.id)
  );
}

function serialiseNote(note: NoteExportRecord): MeetingNoteRecord {
  return {
    content: note.content,
    contentSource: note.contentSource,
    createdAt: note.createdAt,
    id: note.id,
    tags: [...note.tags],
    title: note.title,
    updatedAt: note.updatedAt,
  };
}

function serialiseTranscript(transcript: TranscriptExportRecord): MeetingTranscriptRecord {
  return {
    createdAt: transcript.createdAt,
    id: transcript.id,
    segments: transcript.segments.map((segment) => ({ ...segment })),
    title: transcript.title,
    updatedAt: transcript.updatedAt,
  };
}

function cacheDocumentForMeeting(document: GranolaDocument, cacheData?: CacheData): CacheDocument {
  return (
    cacheData?.documents[document.id] ?? {
      createdAt: document.createdAt,
      id: document.id,
      title: document.title,
      updatedAt: latestDocumentTimestamp(document),
    }
  );
}

function buildMeetingTranscript(
  document: GranolaDocument,
  cacheData?: CacheData,
): {
  loaded: boolean;
  segmentCount: number;
  transcript: MeetingTranscriptRecord | null;
  transcriptText: string | null;
} {
  if (!cacheData) {
    return {
      loaded: false,
      segmentCount: 0,
      transcript: null,
      transcriptText: null,
    };
  }

  const rawSegments = cacheData.transcripts[document.id] ?? [];
  const normalisedSegments = normaliseTranscriptSegments(rawSegments);
  if (normalisedSegments.length === 0) {
    return {
      loaded: true,
      segmentCount: 0,
      transcript: null,
      transcriptText: null,
    };
  }

  const transcript = buildTranscriptExport(
    cacheDocumentForMeeting(document, cacheData),
    normalisedSegments,
    rawSegments,
  );

  return {
    loaded: true,
    segmentCount: transcript.segments.length,
    transcript: serialiseTranscript(transcript),
    transcriptText: renderTranscriptExport(transcript, "text"),
  };
}

function matchesMeetingSearch(document: GranolaDocument, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [document.id, document.title, ...document.tags].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function truncate(value: string, width: number): string {
  if (value.length <= width) {
    return value.padEnd(width);
  }

  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function formatMeetingDate(value: string): string {
  return value.trim().slice(0, 10) || "-";
}

function formatTranscriptStatus(meeting: MeetingSummaryRecord): string {
  if (!meeting.transcriptLoaded) {
    return "n/a";
  }

  if (meeting.transcriptSegmentCount === 0) {
    return "none";
  }

  return String(meeting.transcriptSegmentCount);
}

function formatTranscriptLines(transcript: MeetingTranscriptRecord | null): string {
  if (!transcript || transcript.segments.length === 0) {
    return "";
  }

  return transcript.segments
    .map(
      (segment) =>
        `[${formatTimestampForTranscript(segment.startTimestamp)}] ${segment.speaker}: ${segment.text}`,
    )
    .join("\n");
}

export function buildMeetingSummary(
  document: GranolaDocument,
  cacheData?: CacheData,
): MeetingSummaryRecord {
  const note = buildNoteExport(document);
  const transcript = buildMeetingTranscript(document, cacheData);

  return {
    createdAt: document.createdAt,
    id: document.id,
    noteContentSource: note.contentSource,
    tags: [...document.tags],
    title: document.title,
    transcriptLoaded: transcript.loaded,
    transcriptSegmentCount: transcript.segmentCount,
    updatedAt: latestDocumentTimestamp(document),
  };
}

export function buildMeetingRecord(
  document: GranolaDocument,
  cacheData?: CacheData,
): MeetingRecord {
  const note = buildNoteExport(document);
  const transcript = buildMeetingTranscript(document, cacheData);

  return {
    meeting: {
      createdAt: document.createdAt,
      id: document.id,
      noteContentSource: note.contentSource,
      tags: [...document.tags],
      title: document.title,
      transcriptLoaded: transcript.loaded,
      transcriptSegmentCount: transcript.segmentCount,
      updatedAt: latestDocumentTimestamp(document),
    },
    note: serialiseNote(note),
    noteMarkdown: renderNoteExport(note, "markdown"),
    transcript: transcript.transcript,
    transcriptText: transcript.transcriptText,
  };
}

export function listMeetings(
  documents: GranolaDocument[],
  options: {
    cacheData?: CacheData;
    limit?: number;
    search?: string;
  } = {},
): MeetingSummaryRecord[] {
  const limit = options.limit ?? 20;
  const filtered = documents
    .filter((document) => (options.search ? matchesMeetingSearch(document, options.search) : true))
    .sort(compareMeetingDocuments)
    .slice(0, limit);

  return filtered.map((document) => buildMeetingSummary(document, options.cacheData));
}

export function resolveMeeting(documents: GranolaDocument[], id: string): GranolaDocument {
  const exactMatch = documents.find((document) => document.id === id);
  if (exactMatch) {
    return exactMatch;
  }

  const matches = documents.filter((document) => document.id.startsWith(id));
  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length > 1) {
    const sample = matches
      .slice(0, 5)
      .map((document) => document.id.slice(0, 8))
      .join(", ");
    throw new Error(`ambiguous meeting id: ${id} matches ${matches.length} meetings (${sample})`);
  }

  throw new Error(`meeting not found: ${id}`);
}

export function renderMeetingList(
  meetings: MeetingSummaryRecord[],
  format: MeetingListOutputFormat = "text",
): string {
  switch (format) {
    case "json":
      return toJson(meetings);
    case "yaml":
      return toYaml(meetings);
    case "text":
      break;
  }

  if (meetings.length === 0) {
    return "No meetings found\n";
  }

  const lines = [
    `${"ID".padEnd(10)} ${"DATE".padEnd(10)} ${"TITLE".padEnd(42)} ${"NOTE".padEnd(18)} TRANSCRIPT`,
    `${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(42)} ${"-".repeat(18)} ${"-".repeat(10)}`,
  ];

  for (const meeting of meetings) {
    lines.push(
      [
        meeting.id.slice(0, 8).padEnd(10),
        formatMeetingDate(meeting.updatedAt || meeting.createdAt).padEnd(10),
        truncate(meeting.title || meeting.id, 42),
        truncate(meeting.noteContentSource, 18),
        formatTranscriptStatus(meeting),
      ].join(" "),
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderMeetingView(
  record: MeetingRecord,
  format: MeetingDetailOutputFormat = "text",
): string {
  switch (format) {
    case "json":
      return toJson(record);
    case "yaml":
      return toYaml(record);
    case "text":
      break;
  }

  const tags = record.meeting.tags.length > 0 ? record.meeting.tags.join(", ") : "(none)";
  const transcriptStatus = !record.meeting.transcriptLoaded
    ? "cache not loaded"
    : record.meeting.transcriptSegmentCount === 0
      ? "no transcript segments"
      : `${record.meeting.transcriptSegmentCount} segment(s)`;

  const lines = [
    `# ${record.meeting.title || record.meeting.id}`,
    "",
    `ID: ${record.meeting.id}`,
    `Created: ${record.meeting.createdAt || "-"}`,
    `Updated: ${record.meeting.updatedAt || "-"}`,
    `Tags: ${tags}`,
    `Note source: ${record.meeting.noteContentSource}`,
    `Transcript: ${transcriptStatus}`,
    "",
    "## Notes",
    "",
    record.note.content.trim() || "(no notes)",
    "",
    "## Transcript",
    "",
    formatTranscriptLines(record.transcript) ||
      (record.meeting.transcriptLoaded ? "(no transcript segments)" : "(Granola cache not loaded)"),
    "",
  ];

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderMeetingExport(
  record: MeetingRecord,
  format: MeetingExportOutputFormat = "json",
): string {
  switch (format) {
    case "json":
      return toJson(record);
    case "yaml":
      return toYaml(record);
  }
}
