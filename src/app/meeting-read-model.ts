import { buildMeetingRoleHelpers } from "../meeting-roles.ts";
import { buildNoteExport, renderNoteExport } from "../notes.ts";
import {
  buildTranscriptExport,
  normaliseTranscriptSegments,
  renderTranscriptExport,
} from "../transcripts.ts";
import type { CacheData, CacheDocument, GranolaDocument } from "../types.ts";
import { latestDocumentTimestamp } from "../utils.ts";

import type {
  FolderSummaryRecord,
  MeetingNoteRecord,
  MeetingRecord,
  MeetingRoleHelpersRecord,
  MeetingSummaryRecord,
  MeetingTranscriptRecord,
  TranscriptExportRecord,
} from "./models.ts";

export interface MeetingTranscriptProjection {
  loaded: boolean;
  record: TranscriptExportRecord | null;
  segmentCount: number;
  text: string | null;
  transcript: MeetingTranscriptRecord | null;
}

function serialiseNote(note: ReturnType<typeof buildNoteExport>): MeetingNoteRecord {
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
    speakers: transcript.speakers.map((speaker) => ({ ...speaker })),
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

function buildRoleHelpers(
  document: GranolaDocument,
  transcript: MeetingTranscriptRecord | null,
): MeetingRoleHelpersRecord {
  return buildMeetingRoleHelpers(document.people, transcript?.speakers ?? []);
}

export function cloneFolderSummaryRecord(folder: FolderSummaryRecord): FolderSummaryRecord {
  return { ...folder };
}

export function cloneMeetingSummaryRecord(meeting: MeetingSummaryRecord): MeetingSummaryRecord {
  return {
    ...meeting,
    folders: meeting.folders.map((folder) => cloneFolderSummaryRecord(folder)),
    tags: [...meeting.tags],
  };
}

export function normaliseMeetingSummaryRecord(
  meeting: MeetingSummaryRecord,
): Record<string, unknown> {
  return {
    createdAt: meeting.createdAt,
    folders: meeting.folders
      .map((folder) => ({
        createdAt: folder.createdAt,
        description: folder.description,
        documentCount: folder.documentCount,
        id: folder.id,
        isFavourite: folder.isFavourite,
        name: folder.name,
        updatedAt: folder.updatedAt,
        workspaceId: folder.workspaceId,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    noteContentSource: meeting.noteContentSource,
    tags: [...meeting.tags].sort((left, right) => left.localeCompare(right)),
    title: meeting.title,
    transcriptLoaded: meeting.transcriptLoaded,
    transcriptSegmentCount: meeting.transcriptSegmentCount,
    updatedAt: meeting.updatedAt,
  };
}

export function buildMeetingTranscriptProjection(
  document: GranolaDocument,
  cacheData?: CacheData,
): MeetingTranscriptProjection {
  const rawSegments = cacheData?.transcripts[document.id] ?? document.transcriptSegments ?? [];
  const transcriptKnown = Boolean(cacheData) || Array.isArray(document.transcriptSegments);
  if (!transcriptKnown) {
    return {
      loaded: false,
      record: null,
      segmentCount: 0,
      text: null,
      transcript: null,
    };
  }

  const normalisedSegments = normaliseTranscriptSegments(rawSegments);
  if (normalisedSegments.length === 0) {
    return {
      loaded: true,
      record: null,
      segmentCount: 0,
      text: null,
      transcript: null,
    };
  }

  const transcript = buildTranscriptExport(
    cacheDocumentForMeeting(document, cacheData),
    normalisedSegments,
    rawSegments,
  );

  return {
    loaded: true,
    record: transcript,
    segmentCount: transcript.segments.length,
    text: renderTranscriptExport(transcript, "text"),
    transcript: serialiseTranscript(transcript),
  };
}

export function buildMeetingSummaryRecord(
  document: GranolaDocument,
  cacheData?: CacheData,
  folders: FolderSummaryRecord[] = [],
): MeetingSummaryRecord {
  const note = buildNoteExport(document);
  const transcript = buildMeetingTranscriptProjection(document, cacheData);

  return {
    createdAt: document.createdAt,
    folders: folders.map((folder) => cloneFolderSummaryRecord(folder)),
    id: document.id,
    noteContentSource: note.contentSource,
    tags: [...document.tags],
    title: document.title,
    transcriptLoaded: transcript.loaded,
    transcriptSegmentCount: transcript.segmentCount,
    updatedAt: latestDocumentTimestamp(document),
  };
}

export function buildMeetingRecordFromDocument(
  document: GranolaDocument,
  cacheData?: CacheData,
  folders: FolderSummaryRecord[] = [],
): MeetingRecord {
  const note = buildNoteExport(document);
  const transcript = buildMeetingTranscriptProjection(document, cacheData);
  const roleHelpers = buildRoleHelpers(document, transcript.transcript);

  return {
    meeting: buildMeetingSummaryRecord(document, cacheData, folders),
    note: serialiseNote(note),
    noteMarkdown: renderNoteExport(note, "markdown"),
    roleHelpers,
    transcript: transcript.transcript,
    transcriptText: transcript.text,
  };
}

export function meetingNoteSearchText(document: GranolaDocument): string {
  const note = buildNoteExport(document).content.trim();
  const plain = document.notesPlain.trim();
  if (!note) {
    return plain;
  }

  if (!plain || plain === note) {
    return note;
  }

  return `${note}\n${plain}`;
}

export function meetingTranscriptSearchText(
  document: GranolaDocument,
  cacheData?: CacheData,
): string {
  return buildMeetingTranscriptProjection(document, cacheData).text?.trim() ?? "";
}
