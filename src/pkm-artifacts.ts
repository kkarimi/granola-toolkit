import type { GranolaAgentProviderKind, GranolaDocument } from "./types.ts";
import type {
  GranolaAutomationArtefact,
  GranolaAutomationArtefactActionItem,
  GranolaAutomationArtefactStructuredOutput,
  GranolaMeetingBundle,
} from "./app/types.ts";
import type {
  MeetingTranscriptRecord,
  NoteContentSource,
  NoteExportRecord,
  TranscriptExportRecord,
} from "./app/models.ts";

export type GranPkmEntityKind = "company" | "folder" | "person" | "tag";
export type GranPkmReviewStatus = "approved" | "generated" | "not-required" | "rejected";
export type GranPkmProvenanceSource =
  | "automation-artefact"
  | "gran-meeting"
  | "gran-note"
  | "gran-transcript";

export interface GranPkmMeetingContext {
  createdAt: string;
  folders: Array<{
    id: string;
    name: string;
  }>;
  id: string;
  meetingDate: string;
  tags: string[];
  title: string;
  updatedAt: string;
}

export interface GranPkmArtifactProvenance {
  actionId?: string;
  artefactId?: string;
  capturedAt: string;
  model?: string;
  provider?: GranolaAgentProviderKind;
  reviewStatus: GranPkmReviewStatus;
  ruleId?: string;
  sourceId: string;
  sourceKind: GranPkmProvenanceSource;
  sourceUpdatedAt?: string;
}

export interface GranPkmNoteArtifact {
  content: string;
  contentSource: NoteContentSource;
  createdAt: string;
  id: string;
  kind: "meeting-note";
  markdown: string;
  provenance: GranPkmArtifactProvenance;
  title: string;
  updatedAt: string;
}

export interface GranPkmTranscriptArtifact {
  createdAt: string;
  id: string;
  kind: "transcript";
  markdown: string;
  provenance: GranPkmArtifactProvenance;
  segmentCount: number;
  speakers: string[];
  text: string;
  title: string;
  updatedAt: string;
}

export interface GranPkmDecisionArtifact {
  id: string;
  kind: "decision";
  provenance: GranPkmArtifactProvenance;
  text: string;
}

export interface GranPkmActionItemArtifact {
  dueDate?: string;
  id: string;
  kind: "action-item";
  owner?: string;
  ownerEmail?: string;
  ownerRole?: GranolaAutomationArtefactActionItem["ownerRole"];
  provenance: GranPkmArtifactProvenance;
  title: string;
}

export interface GranPkmEntityArtifact {
  email?: string;
  id: string;
  kind: "entity";
  label: string;
  provenance: GranPkmArtifactProvenance;
  title?: string;
  type: GranPkmEntityKind;
}

export interface GranPkmArtifactBundle {
  actionItems: GranPkmActionItemArtifact[];
  decisions: GranPkmDecisionArtifact[];
  entities: GranPkmEntityArtifact[];
  meeting: GranPkmMeetingContext;
  note: GranPkmNoteArtifact;
  transcript?: GranPkmTranscriptArtifact;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function meetingDateValue(document: Pick<GranolaDocument, "calendarEvent" | "createdAt">): string {
  const timestamp = document.calendarEvent?.startTime || document.createdAt;
  return timestamp.trim() ? timestamp.slice(0, 10) : "unknown-date";
}

function normaliseKey(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function decisionId(sourceId: string, text: string, index: number): string {
  const slug = normaliseKey(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${sourceId}:decision:${slug || index}`;
}

function actionItemId(sourceId: string, title: string, index: number): string {
  const slug = normaliseKey(title)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${sourceId}:action-item:${slug || index}`;
}

function folderEntityId(folder: { id: string; name: string }): string {
  return `folder:${folder.id}`;
}

function tagEntityId(tag: string): string {
  return `tag:${normaliseKey(tag).replace(/[^a-z0-9]+/g, "-")}`;
}

function personEntityId(person: { email?: string; label: string }): string {
  return `person:${normaliseKey(person.email || person.label).replace(/[^a-z0-9]+/g, "-")}`;
}

function companyEntityId(companyName: string): string {
  return `company:${normaliseKey(companyName).replace(/[^a-z0-9]+/g, "-")}`;
}

function reviewStatusForArtefact(
  artefact: Pick<GranolaAutomationArtefact, "status">,
): GranPkmReviewStatus {
  switch (artefact.status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "generated":
    case "superseded":
    default:
      return "generated";
  }
}

function noteMarkdownContent(note: Pick<NoteExportRecord, "content">): string {
  return note.content.trim();
}

function transcriptTextContent(
  transcript: Pick<TranscriptExportRecord, "segments"> | Pick<MeetingTranscriptRecord, "segments">,
): string {
  return transcript.segments
    .map(
      (segment) => `[${segment.startTimestamp.slice(11, 19)}] ${segment.speaker}: ${segment.text}`,
    )
    .join("\n")
    .trim();
}

function transcriptMarkdownContent(
  transcript: Pick<TranscriptExportRecord, "segments"> | Pick<MeetingTranscriptRecord, "segments">,
): string {
  if (transcript.segments.length === 0) {
    return "(Transcript unavailable)";
  }

  return transcript.segments
    .map(
      (segment) =>
        `- [${segment.startTimestamp.slice(11, 19)}] **${segment.speaker}:** ${segment.text}`,
    )
    .join("\n")
    .trim();
}

function transcriptSpeakerLabels(
  transcript: Pick<TranscriptExportRecord, "speakers"> | Pick<MeetingTranscriptRecord, "speakers">,
): string[] {
  return uniqueStrings(transcript.speakers.map((speaker) => speaker.label));
}

function baseMeetingProvenance(
  meeting: GranPkmMeetingContext,
): Omit<GranPkmArtifactProvenance, "capturedAt" | "reviewStatus" | "sourceId" | "sourceKind"> {
  return {
    sourceUpdatedAt: meeting.updatedAt,
  };
}

function automationProvenance(
  artefact: Pick<
    GranolaAutomationArtefact,
    "actionId" | "id" | "model" | "provider" | "ruleId" | "updatedAt" | "status"
  >,
): GranPkmArtifactProvenance {
  return {
    actionId: artefact.actionId,
    artefactId: artefact.id,
    capturedAt: artefact.updatedAt,
    model: artefact.model,
    provider: artefact.provider,
    reviewStatus: reviewStatusForArtefact(artefact),
    ruleId: artefact.ruleId,
    sourceId: artefact.id,
    sourceKind: "automation-artefact",
    sourceUpdatedAt: artefact.updatedAt,
  };
}

function metadataStringArray(
  metadata: GranolaAutomationArtefactStructuredOutput["metadata"],
  key: string,
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

export function buildPkmMeetingContextFromDocument(
  document: Pick<
    GranolaDocument,
    "calendarEvent" | "createdAt" | "folderMemberships" | "id" | "tags" | "title" | "updatedAt"
  >,
): GranPkmMeetingContext {
  return {
    createdAt: document.createdAt,
    folders: (document.folderMemberships ?? []).map((folder) => ({
      id: folder.id,
      name: folder.name,
    })),
    id: document.id,
    meetingDate: meetingDateValue(document),
    tags: [...document.tags],
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

export function buildPkmNoteArtifact(
  meeting: GranPkmMeetingContext,
  note: Pick<
    NoteExportRecord,
    "content" | "contentSource" | "createdAt" | "id" | "title" | "updatedAt"
  >,
): GranPkmNoteArtifact {
  return {
    content: note.content,
    contentSource: note.contentSource,
    createdAt: note.createdAt,
    id: `${meeting.id}:note`,
    kind: "meeting-note",
    markdown: noteMarkdownContent(note),
    provenance: {
      ...baseMeetingProvenance(meeting),
      capturedAt: note.updatedAt,
      reviewStatus: "not-required",
      sourceId: note.id,
      sourceKind: "gran-note",
    },
    title: note.title || meeting.title,
    updatedAt: note.updatedAt,
  };
}

export function buildPkmTranscriptArtifact(
  meeting: GranPkmMeetingContext,
  transcript:
    | Pick<
        TranscriptExportRecord,
        "createdAt" | "id" | "segments" | "speakers" | "title" | "updatedAt"
      >
    | Pick<
        MeetingTranscriptRecord,
        "createdAt" | "id" | "segments" | "speakers" | "title" | "updatedAt"
      >,
): GranPkmTranscriptArtifact {
  return {
    createdAt: transcript.createdAt,
    id: `${meeting.id}:transcript`,
    kind: "transcript",
    markdown: transcriptMarkdownContent(transcript),
    provenance: {
      ...baseMeetingProvenance(meeting),
      capturedAt: transcript.updatedAt,
      reviewStatus: "not-required",
      sourceId: transcript.id,
      sourceKind: "gran-transcript",
    },
    segmentCount: transcript.segments.length,
    speakers: transcriptSpeakerLabels(transcript),
    text: transcriptTextContent(transcript),
    title: transcript.title || meeting.title,
    updatedAt: transcript.updatedAt,
  };
}

export function buildPkmEntityArtifactsFromDocument(
  meeting: GranPkmMeetingContext,
  document: Pick<GranolaDocument, "people">,
): GranPkmEntityArtifact[] {
  const provenance: GranPkmArtifactProvenance = {
    ...baseMeetingProvenance(meeting),
    capturedAt: meeting.updatedAt,
    reviewStatus: "not-required",
    sourceId: meeting.id,
    sourceKind: "gran-meeting",
  };

  const folderEntities: GranPkmEntityArtifact[] = meeting.folders.map((folder) => ({
    id: folderEntityId(folder),
    kind: "entity" as const,
    label: folder.name,
    provenance,
    type: "folder" as const,
  }));

  const tagEntities: GranPkmEntityArtifact[] = meeting.tags.map((tag) => ({
    id: tagEntityId(tag),
    kind: "entity" as const,
    label: tag,
    provenance,
    type: "tag" as const,
  }));

  const attendees = document.people?.attendees ?? [];
  const personEntities = attendees.reduce<GranPkmEntityArtifact[]>((items, person) => {
    const label = person.name?.trim() || person.email?.trim() || person.companyName?.trim();
    if (!label) {
      return items;
    }

    items.push({
      email: person.email?.trim() || undefined,
      id: personEntityId({
        email: person.email?.trim() || undefined,
        label,
      }),
      kind: "entity" as const,
      label,
      provenance,
      title: person.title?.trim() || undefined,
      type: "person" as const,
    });
    return items;
  }, []);

  const companyEntities: GranPkmEntityArtifact[] = uniqueStrings(
    attendees.map((person) => person.companyName),
  ).map((companyName) => ({
    id: companyEntityId(companyName),
    kind: "entity" as const,
    label: companyName,
    provenance,
    type: "company" as const,
  }));

  return dedupeById([...folderEntities, ...tagEntities, ...personEntities, ...companyEntities]);
}

export function buildPkmAutomationArtefactProjection(
  artefact: Pick<
    GranolaAutomationArtefact,
    "actionId" | "id" | "model" | "provider" | "ruleId" | "status" | "structured" | "updatedAt"
  >,
): Pick<GranPkmArtifactBundle, "actionItems" | "decisions" | "entities"> {
  const provenance = automationProvenance(artefact);
  const decisions = artefact.structured.decisions.map((text, index) => ({
    id: decisionId(artefact.id, text, index),
    kind: "decision" as const,
    provenance,
    text,
  }));
  const actionItems = artefact.structured.actionItems.map((item, index) => ({
    dueDate: item.dueDate,
    id: actionItemId(artefact.id, item.title, index),
    kind: "action-item" as const,
    owner: item.owner,
    ownerEmail: item.ownerEmail,
    ownerRole: item.ownerRole,
    provenance,
    title: item.title,
  }));

  const participantEntities = (artefact.structured.participantSummaries ?? []).map((summary) => ({
    id: personEntityId({
      label: summary.speaker,
    }),
    kind: "entity" as const,
    label: summary.speaker,
    provenance,
    type: "person" as const,
  }));

  const companyEntities = metadataStringArray(artefact.structured.metadata, "companies").map(
    (company) => ({
      id: companyEntityId(company),
      kind: "entity" as const,
      label: company,
      provenance,
      type: "company" as const,
    }),
  );

  return {
    actionItems: dedupeById(actionItems),
    decisions: dedupeById(decisions),
    entities: dedupeById([...participantEntities, ...companyEntities]),
  };
}

export function buildMeetingPkmArtifactBundle(
  bundle: GranolaMeetingBundle,
  options: {
    artefacts?: GranolaAutomationArtefact[];
  } = {},
): GranPkmArtifactBundle {
  const meeting = buildPkmMeetingContextFromDocument(bundle.source.document);
  const note = buildPkmNoteArtifact(meeting, bundle.meeting.note);
  const transcript = bundle.meeting.transcript
    ? buildPkmTranscriptArtifact(meeting, bundle.meeting.transcript)
    : undefined;
  const baseEntities = buildPkmEntityArtifactsFromDocument(meeting, bundle.source.document);

  const derived = (options.artefacts ?? []).map((artefact) =>
    buildPkmAutomationArtefactProjection(artefact),
  );

  return {
    actionItems: dedupeById(derived.flatMap((item) => item.actionItems)),
    decisions: dedupeById(derived.flatMap((item) => item.decisions)),
    entities: dedupeById([...baseEntities, ...derived.flatMap((item) => item.entities)]),
    meeting,
    note,
    transcript,
  };
}
