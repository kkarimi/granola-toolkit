import type {
  GranolaCalendarEvent,
  GranolaDocument,
  GranolaFolder,
  GranolaFolderMembership,
  GranolaMeetingPeople,
  GranolaMeetingPerson,
  LastViewedPanel,
  ProseMirrorDoc,
  TranscriptSegment,
} from "../types.ts";
import { asRecord, parseJsonString, stringArray, stringValue } from "../utils.ts";

function parseProseMirrorDoc(
  value: unknown,
  options: { skipHtmlStrings?: boolean } = {},
): ProseMirrorDoc | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (options.skipHtmlStrings && trimmed.startsWith("<")) {
      return undefined;
    }

    const parsed = parseJsonString<unknown>(trimmed);
    if (!parsed) {
      return undefined;
    }

    return parseProseMirrorDoc(parsed, options);
  }

  const record = asRecord(value);
  if (!record || record.type !== "doc") {
    return undefined;
  }

  return record as unknown as ProseMirrorDoc;
}

function parseLastViewedPanel(value: unknown): LastViewedPanel | undefined {
  const panel = asRecord(value);
  if (!panel) {
    return undefined;
  }

  return {
    affinityNoteId: stringValue(panel.affinity_note_id),
    content: parseProseMirrorDoc(panel.content, { skipHtmlStrings: true }),
    contentUpdatedAt: stringValue(panel.content_updated_at),
    createdAt: stringValue(panel.created_at),
    deletedAt: stringValue(panel.deleted_at),
    documentId: stringValue(panel.document_id),
    generatedLines: Array.isArray(panel.generated_lines) ? panel.generated_lines : [],
    id: stringValue(panel.id),
    lastViewedAt: stringValue(panel.last_viewed_at),
    originalContent: stringValue(panel.original_content),
    suggestedQuestions: panel.suggested_questions,
    templateSlug: stringValue(panel.template_slug),
    title: stringValue(panel.title),
    updatedAt: stringValue(panel.updated_at),
  };
}

function parseCalendarEvent(value: unknown): GranolaCalendarEvent | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = stringValue(record.id);
  const recurringEventId =
    stringValue(record.recurring_event_id) || stringValue(record.recurringEventId);
  const calendarId = stringValue(record.calendar_id) || stringValue(record.calendarId);
  const url = stringValue(record.url);
  const htmlLink = stringValue(record.html_link) || stringValue(record.htmlLink);
  const startTime = stringValue(record.start_time) || stringValue(record.startTime);
  const endTime = stringValue(record.end_time) || stringValue(record.endTime);

  if (!id && !recurringEventId && !calendarId && !url && !htmlLink && !startTime && !endTime) {
    return undefined;
  }

  return {
    calendarId: calendarId || undefined,
    endTime: endTime || undefined,
    htmlLink: htmlLink || undefined,
    id: id || undefined,
    recurringEventId: recurringEventId || undefined,
    startTime: startTime || undefined,
    url: url || undefined,
  };
}

function parsePerson(value: unknown): GranolaMeetingPerson | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const details = asRecord(record.details);
  const person = asRecord(details?.person);
  const nameRecord = asRecord(person?.name);
  const company = asRecord(details?.company);
  const employment = asRecord(person?.employment);

  const name =
    stringValue(record.name) ||
    stringValue(nameRecord?.fullName) ||
    stringValue(nameRecord?.displayName);
  const email = stringValue(record.email);
  const companyName = stringValue(company?.name) || stringValue(employment?.name);
  const title = stringValue(employment?.title);

  if (!name && !email && !companyName && !title) {
    return undefined;
  }

  return {
    companyName: companyName || undefined,
    email: email || undefined,
    name: name || undefined,
    title: title || undefined,
  };
}

function parsePeople(value: unknown): GranolaMeetingPeople | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const creator = parsePerson(record.creator);
  const attendees = Array.isArray(record.attendees)
    ? record.attendees
        .map(parsePerson)
        .filter((person): person is GranolaMeetingPerson => Boolean(person))
    : [];

  if (!creator && attendees.length === 0) {
    return undefined;
  }

  return {
    attendees,
    creator,
  };
}

export function parseDocument(value: unknown): GranolaDocument {
  const record = asRecord(value);
  if (!record) {
    throw new Error("document payload is not an object");
  }

  return {
    calendarEvent: parseCalendarEvent(record.google_calendar_event),
    content: stringValue(record.content),
    createdAt: stringValue(record.created_at),
    id: stringValue(record.id),
    lastViewedPanel: parseLastViewedPanel(record.last_viewed_panel),
    notes: parseProseMirrorDoc(record.notes),
    notesPlain: stringValue(record.notes_plain),
    people: parsePeople(record.people),
    tags: stringArray(record.tags),
    title: stringValue(record.title),
    updatedAt: stringValue(record.updated_at),
  };
}

function parseFolderMembership(value: unknown): GranolaFolderMembership | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = stringValue(record.id);
  const name = stringValue(record.name);
  if (!id || !name) {
    return undefined;
  }

  return { id, name };
}

function parsePublicTranscriptSegment(
  documentId: string,
  value: unknown,
  index: number,
): TranscriptSegment | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const text = stringValue(record.text);
  const startTimestamp = stringValue(record.start_time);
  const endTimestamp = stringValue(record.end_time) || startTimestamp;
  if (!text || !startTimestamp) {
    return undefined;
  }

  const speaker = asRecord(record.speaker);
  return {
    documentId,
    endTimestamp,
    id: stringValue(record.id) || `${documentId}:transcript:${index + 1}`,
    isFinal: true,
    source: stringValue(speaker?.name) || stringValue(speaker?.source) || "unknown",
    startTimestamp,
    text,
  };
}

export interface PublicNoteSummary {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
}

export function parsePublicNoteSummary(value: unknown): PublicNoteSummary {
  const record = asRecord(value);
  if (!record) {
    throw new Error("public note payload is not an object");
  }

  return {
    createdAt: stringValue(record.created_at),
    id: stringValue(record.id),
    title: stringValue(record.title),
    updatedAt: stringValue(record.updated_at),
  };
}

export function parsePublicNote(value: unknown): GranolaDocument {
  const record = asRecord(value);
  if (!record) {
    throw new Error("public note payload is not an object");
  }

  const id = stringValue(record.id);
  const summaryMarkdown = stringValue(record.summary_markdown);
  const summaryText = stringValue(record.summary_text);

  return {
    calendarEvent: parseCalendarEvent(record.google_calendar_event),
    content: summaryMarkdown || summaryText,
    createdAt: stringValue(record.created_at),
    folderMemberships: Array.isArray(record.folder_membership)
      ? record.folder_membership
          .map(parseFolderMembership)
          .filter((membership): membership is GranolaFolderMembership => Boolean(membership))
      : [],
    id,
    notesPlain: summaryText,
    people: parsePeople(record.people),
    tags: [],
    title: stringValue(record.title),
    transcriptSegments: Array.isArray(record.transcript)
      ? record.transcript
          .map((segment, index) => parsePublicTranscriptSegment(id, segment, index))
          .filter((segment): segment is TranscriptSegment => Boolean(segment))
      : [],
    updatedAt: stringValue(record.updated_at),
  };
}

function parseFolderDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      const record = asRecord(item);
      if (!record) {
        return "";
      }

      return stringValue(record.id) || stringValue(record.document_id);
    })
    .filter(Boolean);
}

export function parseFolder(value: unknown): GranolaFolder {
  const record = asRecord(value);
  if (!record) {
    throw new Error("folder payload is not an object");
  }

  const createdAt = stringValue(record.created_at);
  const updatedAt = stringValue(record.updated_at) || createdAt;
  const name = stringValue(record.name) || stringValue(record.title);
  const documents = parseFolderDocumentIds(record.documents);
  const documentIds =
    documents.length > 0 ? documents : parseFolderDocumentIds(record.document_ids);

  return {
    createdAt,
    description: stringValue(record.description) || undefined,
    documentIds,
    id: stringValue(record.id),
    isFavourite: Boolean(record.is_favourite),
    name,
    updatedAt,
    workspaceId: stringValue(record.workspace_id) || undefined,
  };
}
