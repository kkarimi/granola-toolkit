import type {
  FolderSummaryRecord,
  MeetingRecord,
  MeetingSummaryRecord,
  MeetingTranscriptRecord,
} from "./app/models.ts";
import {
  buildMeetingTranscriptProjection,
  buildMeetingRecordFromDocument,
  buildMeetingSummaryRecord,
} from "./app/meeting-read-model.ts";
import { buildNoteExport, renderNoteExport } from "./notes.ts";
import { toJson, toYaml } from "./render.ts";
import { renderTranscriptExport } from "./transcripts.ts";
import type { CacheData, GranolaDocument } from "./types.ts";
import { compareStrings, formatTimestampForTranscript, latestDocumentTimestamp } from "./utils.ts";
import type { GranolaMeetingSort } from "./app/types.ts";
import type { NoteOutputFormat, TranscriptOutputFormat } from "./types.ts";

export type MeetingListOutputFormat = "json" | "text" | "yaml";
export type MeetingDetailOutputFormat = "json" | "text" | "yaml";
export type MeetingExportOutputFormat = "json" | "yaml";
export type MeetingNotesOutputFormat = NoteOutputFormat;
export type MeetingTranscriptOutputFormat = TranscriptOutputFormat;

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

function compareMeetingDocumentsByTitle(left: GranolaDocument, right: GranolaDocument): number {
  return (
    compareStrings(left.title || left.id, right.title || right.id) ||
    compareTimestampsDescending(latestDocumentTimestamp(left), latestDocumentTimestamp(right)) ||
    compareStrings(left.id, right.id)
  );
}

function compareMeetingDocumentsBySort(
  left: GranolaDocument,
  right: GranolaDocument,
  sort: GranolaMeetingSort,
): number {
  switch (sort) {
    case "title-asc":
      return compareMeetingDocumentsByTitle(left, right);
    case "title-desc":
      return -compareMeetingDocumentsByTitle(left, right);
    case "updated-asc":
      return -compareMeetingDocuments(left, right);
    case "updated-desc":
    default:
      return compareMeetingDocuments(left, right);
  }
}

function compareMeetingSummariesByUpdated(
  left: MeetingSummaryRecord,
  right: MeetingSummaryRecord,
): number {
  return (
    compareTimestampsDescending(left.updatedAt, right.updatedAt) ||
    compareTimestampsDescending(left.createdAt, right.createdAt) ||
    compareStrings(left.title || left.id, right.title || right.id) ||
    compareStrings(left.id, right.id)
  );
}

function compareMeetingSummariesByTitle(
  left: MeetingSummaryRecord,
  right: MeetingSummaryRecord,
): number {
  return (
    compareStrings(left.title || left.id, right.title || right.id) ||
    compareTimestampsDescending(left.updatedAt, right.updatedAt) ||
    compareStrings(left.id, right.id)
  );
}

function compareMeetingSummariesBySort(
  left: MeetingSummaryRecord,
  right: MeetingSummaryRecord,
  sort: GranolaMeetingSort,
): number {
  switch (sort) {
    case "title-asc":
      return compareMeetingSummariesByTitle(left, right);
    case "title-desc":
      return -compareMeetingSummariesByTitle(left, right);
    case "updated-asc":
      return -compareMeetingSummariesByUpdated(left, right);
    case "updated-desc":
    default:
      return compareMeetingSummariesByUpdated(left, right);
  }
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

function matchesMeetingFolders(
  documentId: string,
  folderId: string | undefined,
  foldersByDocumentId?: Map<string, FolderSummaryRecord[]>,
): boolean {
  if (!folderId) {
    return true;
  }

  return (foldersByDocumentId?.get(documentId) ?? []).some((folder) => folder.id === folderId);
}

function matchesMeetingSummarySearch(meeting: MeetingSummaryRecord, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return [meeting.id, meeting.title, ...meeting.tags].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function meetingFolders(meeting: MeetingSummaryRecord): FolderSummaryRecord[] {
  return Array.isArray(meeting.folders) ? meeting.folders : [];
}

function parseDateFilter(
  value: string | undefined,
  label: "updatedFrom" | "updatedTo",
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${label === "updatedFrom" ? "00:00:00.000" : "23:59:59.999"}`
    : trimmed;
  const timestamp = Date.parse(candidate);
  if (Number.isNaN(timestamp)) {
    throw new Error(`invalid ${label}: expected ISO timestamp or YYYY-MM-DD`);
  }

  return timestamp;
}

function matchesUpdatedRange(
  document: GranolaDocument,
  updatedFrom?: string,
  updatedTo?: string,
): boolean {
  const from = parseDateFilter(updatedFrom, "updatedFrom");
  const to = parseDateFilter(updatedTo, "updatedTo");
  const updatedAt = parseTimestamp(latestDocumentTimestamp(document));
  if (updatedAt == null) {
    return from == null && to == null;
  }

  if (from != null && updatedAt < from) {
    return false;
  }

  if (to != null && updatedAt > to) {
    return false;
  }

  return true;
}

function matchesMeetingSummaryUpdatedRange(
  meeting: MeetingSummaryRecord,
  updatedFrom?: string,
  updatedTo?: string,
): boolean {
  const from = parseDateFilter(updatedFrom, "updatedFrom");
  const to = parseDateFilter(updatedTo, "updatedTo");
  const updatedAt = parseTimestamp(meeting.updatedAt || meeting.createdAt);
  if (updatedAt == null) {
    return from == null && to == null;
  }

  if (from != null && updatedAt < from) {
    return false;
  }

  if (to != null && updatedAt > to) {
    return false;
  }

  return true;
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
  folders: FolderSummaryRecord[] = [],
): MeetingSummaryRecord {
  return buildMeetingSummaryRecord(document, cacheData, folders);
}

export function buildMeetingRecord(
  document: GranolaDocument,
  cacheData?: CacheData,
  folders: FolderSummaryRecord[] = [],
): MeetingRecord {
  return buildMeetingRecordFromDocument(document, cacheData, folders);
}

export function listMeetings(
  documents: GranolaDocument[],
  options: {
    cacheData?: CacheData;
    folderId?: string;
    foldersByDocumentId?: Map<string, FolderSummaryRecord[]>;
    limit?: number;
    search?: string;
    sort?: GranolaMeetingSort;
    updatedFrom?: string;
    updatedTo?: string;
  } = {},
): MeetingSummaryRecord[] {
  const limit = options.limit ?? 20;
  const sort = options.sort ?? "updated-desc";
  const filtered = documents
    .filter((document) => (options.search ? matchesMeetingSearch(document, options.search) : true))
    .filter((document) =>
      matchesMeetingFolders(document.id, options.folderId, options.foldersByDocumentId),
    )
    .filter((document) => matchesUpdatedRange(document, options.updatedFrom, options.updatedTo))
    .sort((left, right) => compareMeetingDocumentsBySort(left, right, sort))
    .slice(0, limit);

  return filtered.map((document) =>
    buildMeetingSummary(document, options.cacheData, options.foldersByDocumentId?.get(document.id)),
  );
}

export function filterMeetingSummaries(
  meetings: MeetingSummaryRecord[],
  options: {
    folderId?: string;
    limit?: number;
    search?: string;
    sort?: GranolaMeetingSort;
    updatedFrom?: string;
    updatedTo?: string;
  } = {},
): MeetingSummaryRecord[] {
  const limit = options.limit ?? 20;
  const sort = options.sort ?? "updated-desc";

  return meetings
    .filter((meeting) =>
      options.folderId
        ? meetingFolders(meeting).some((folder) => folder.id === options.folderId)
        : true,
    )
    .filter((meeting) =>
      options.search ? matchesMeetingSummarySearch(meeting, options.search) : true,
    )
    .filter((meeting) =>
      matchesMeetingSummaryUpdatedRange(meeting, options.updatedFrom, options.updatedTo),
    )
    .sort((left, right) => compareMeetingSummariesBySort(left, right, sort))
    .slice(0, limit)
    .map((meeting) => ({
      ...meeting,
      folders: meetingFolders(meeting).map((folder) => ({ ...folder })),
      tags: [...meeting.tags],
    }));
}

export function resolveMeetingQuery(documents: GranolaDocument[], query: string): GranolaDocument {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("meeting query is required");
  }

  const lower = trimmed.toLowerCase();
  const exactId = documents.find((document) => document.id === trimmed);
  if (exactId) {
    return exactId;
  }

  const exactTitleMatches = documents.filter((document) => document.title.toLowerCase() === lower);
  if (exactTitleMatches.length === 1) {
    return exactTitleMatches[0]!;
  }

  const prefixMatches = documents.filter((document) => document.id.startsWith(trimmed));
  if (prefixMatches.length === 1) {
    return prefixMatches[0]!;
  }

  const titleMatches = documents
    .filter((document) => document.title.toLowerCase().includes(lower))
    .sort(compareMeetingDocuments);
  if (titleMatches.length === 1) {
    return titleMatches[0]!;
  }

  if (exactTitleMatches.length > 1 || prefixMatches.length > 1 || titleMatches.length > 1) {
    throw new Error(`ambiguous meeting query: ${trimmed}`);
  }

  throw new Error(`meeting not found: ${trimmed}`);
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
    `${"ID".padEnd(10)} ${"DATE".padEnd(10)} ${"TITLE".padEnd(34)} ${"FOLDERS".padEnd(18)} ${"NOTE".padEnd(18)} TRANSCRIPT`,
    `${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(34)} ${"-".repeat(18)} ${"-".repeat(18)} ${"-".repeat(10)}`,
  ];

  for (const meeting of meetings) {
    const folderLabel =
      meetingFolders(meeting).length === 0
        ? "-"
        : meetingFolders(meeting).length === 1
          ? meetingFolders(meeting)[0]!.name
          : `${meetingFolders(meeting)[0]!.name} +${meetingFolders(meeting).length - 1}`;
    lines.push(
      [
        meeting.id.slice(0, 8).padEnd(10),
        formatMeetingDate(meeting.updatedAt || meeting.createdAt).padEnd(10),
        truncate(meeting.title || meeting.id, 34),
        truncate(folderLabel, 18),
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
  const folders =
    meetingFolders(record.meeting).length > 0
      ? meetingFolders(record.meeting)
          .map((folder) => folder.name)
          .join(", ")
      : "(none)";
  const transcriptStatus = !record.meeting.transcriptLoaded
    ? "on demand"
    : record.meeting.transcriptSegmentCount === 0
      ? "no transcript segments"
      : `${record.meeting.transcriptSegmentCount} segment(s)`;
  const ownerCandidates =
    record.roleHelpers.ownerCandidates.length > 0
      ? record.roleHelpers.ownerCandidates.map((candidate) => candidate.label).join(", ")
      : "(none)";
  const speakers =
    record.roleHelpers.speakers.length > 0
      ? record.roleHelpers.speakers.map((speaker) => speaker.label).join(", ")
      : "(none)";

  const lines = [
    `# ${record.meeting.title || record.meeting.id}`,
    "",
    `ID: ${record.meeting.id}`,
    `Created: ${record.meeting.createdAt || "-"}`,
    `Updated: ${record.meeting.updatedAt || "-"}`,
    `Tags: ${tags}`,
    `Folders: ${folders}`,
    `Note source: ${record.meeting.noteContentSource}`,
    `Transcript: ${transcriptStatus}`,
    `Owner candidates: ${ownerCandidates}`,
    `Speakers: ${speakers}`,
    "",
    "## Notes",
    "",
    record.note.content.trim() || "(no notes)",
    "",
    "## Transcript",
    "",
    formatTranscriptLines(record.transcript) ||
      (record.meeting.transcriptLoaded
        ? "(no transcript segments)"
        : "(Transcript loads on demand)"),
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

export function renderMeetingNotes(
  document: GranolaDocument,
  format: MeetingNotesOutputFormat = "markdown",
): string {
  return renderNoteExport(buildNoteExport(document), format);
}

export function renderMeetingTranscript(
  document: GranolaDocument,
  cacheData?: CacheData,
  format: MeetingTranscriptOutputFormat = "text",
): string {
  const transcript = buildMeetingTranscriptProjection(document, cacheData).record;
  if (!transcript) {
    return "";
  }

  return renderTranscriptExport(transcript, format);
}
