import {
  buildMeetingPkmArtifactBundle,
  buildPkmAutomationArtefactProjection,
} from "./pkm-artifacts.ts";
import type {
  GranPkmActionItemArtifact,
  GranPkmArtifactBundle,
  GranPkmArtifactProvenance,
  GranPkmAutomationProjection,
  GranPkmDecisionArtifact,
  GranPkmEntityArtifact,
  GranPkmNoteArtifact,
  GranPkmTranscriptArtifact,
} from "./pkm-artifacts.ts";
import type {
  GranolaAutomationArtefact,
  GranolaAppSyncEvent,
  GranolaMeetingBundle,
  GranolaYazdArtifact,
  GranolaYazdArtifactBundle,
  GranolaYazdSourceChange,
  GranolaYazdSourceFetchResult,
  GranolaYazdSourceInfo,
  GranolaYazdSourceItemSummary,
} from "./app/types.ts";
import type { MeetingSummaryRecord } from "./app/models.ts";
import type { GranolaFolderMembership } from "./types.ts";

export const GRAN_YAZD_SOURCE_ID = "gran";

function meetingFolders(meeting: Pick<MeetingSummaryRecord, "folders">): string[] {
  return meeting.folders.map((folder) => folder.name).filter(Boolean);
}

function transcriptSummary(
  meeting: Pick<MeetingSummaryRecord, "transcriptLoaded" | "transcriptSegmentCount">,
): string {
  if (!meeting.transcriptLoaded) {
    return "transcript on demand";
  }

  if (meeting.transcriptSegmentCount <= 0) {
    return "transcript ready";
  }

  return `${meeting.transcriptSegmentCount} transcript segments`;
}

function summariseMeeting(
  meeting: Pick<MeetingSummaryRecord, "folders" | "transcriptLoaded" | "transcriptSegmentCount">,
): string {
  const parts: string[] = [];
  const folders = meetingFolders(meeting);
  if (folders.length > 0) {
    parts.push(folders.join(", "));
  }
  parts.push(transcriptSummary(meeting));
  return parts.join(" · ");
}

function mapProvenance(provenance: GranPkmArtifactProvenance): GranolaYazdArtifact["provenance"] {
  return {
    actionId: provenance.actionId,
    artefactId: provenance.artefactId,
    capturedAt: provenance.capturedAt,
    model: provenance.model,
    provider: provenance.provider,
    reviewStatus: provenance.reviewStatus === "not-required" ? "approved" : provenance.reviewStatus,
    ruleId: provenance.ruleId,
    sourceId: provenance.sourceId,
    sourceKind: provenance.sourceKind,
    sourceUpdatedAt: provenance.sourceUpdatedAt,
  };
}

function mapNoteArtifact(artifact: GranPkmNoteArtifact): GranolaYazdArtifact {
  return {
    id: artifact.id,
    kind: "note",
    markdown: artifact.markdown,
    metadata: {
      contentSource: artifact.contentSource,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
    },
    provenance: mapProvenance(artifact.provenance),
    text: artifact.content,
    title: artifact.title,
  };
}

function mapAutomationNoteArtifact(
  artefact: Pick<
    GranolaAutomationArtefact,
    "actionId" | "id" | "kind" | "parseMode" | "ruleId" | "structured" | "updatedAt"
  >,
  provenance: GranPkmAutomationProjection["provenance"],
): GranolaYazdArtifact {
  return {
    id: artefact.id,
    kind: "note",
    markdown: artefact.structured.markdown,
    metadata: {
      actionId: artefact.actionId,
      automationArtefactKind: artefact.kind,
      parseMode: artefact.parseMode,
      ruleId: artefact.ruleId,
      sections: artefact.structured.sections.map((section) => ({
        body: section.body,
        title: section.title,
      })),
      summary: artefact.structured.summary,
      updatedAt: artefact.updatedAt,
    },
    provenance: mapProvenance(provenance),
    text: artefact.structured.summary?.trim() || artefact.structured.markdown,
    title: artefact.structured.title,
  };
}

function mapTranscriptArtifact(artifact: GranPkmTranscriptArtifact): GranolaYazdArtifact {
  return {
    id: artifact.id,
    kind: "transcript",
    markdown: artifact.markdown,
    metadata: {
      createdAt: artifact.createdAt,
      segmentCount: artifact.segmentCount,
      speakers: [...artifact.speakers],
      updatedAt: artifact.updatedAt,
    },
    provenance: mapProvenance(artifact.provenance),
    text: artifact.text,
    title: artifact.title,
  };
}

function mapDecisionArtifact(artifact: GranPkmDecisionArtifact): GranolaYazdArtifact {
  return {
    id: artifact.id,
    kind: "decision",
    provenance: mapProvenance(artifact.provenance),
    text: artifact.text,
    title: artifact.text,
  };
}

function mapActionItemArtifact(artifact: GranPkmActionItemArtifact): GranolaYazdArtifact {
  return {
    id: artifact.id,
    kind: "action-item",
    metadata: {
      dueDate: artifact.dueDate,
      owner: artifact.owner,
      ownerEmail: artifact.ownerEmail,
      ownerRole: artifact.ownerRole,
    },
    provenance: mapProvenance(artifact.provenance),
    title: artifact.title,
  };
}

function mapEntityArtifact(artifact: GranPkmEntityArtifact): GranolaYazdArtifact {
  return {
    id: artifact.id,
    kind: "entity",
    metadata: {
      email: artifact.email,
      title: artifact.title,
      type: artifact.type,
    },
    provenance: mapProvenance(artifact.provenance),
    text: artifact.label,
    title: artifact.label,
  };
}

function mapArtifactBundle(bundle: GranPkmArtifactBundle): GranolaYazdArtifactBundle {
  const artifacts: GranolaYazdArtifact[] = [mapNoteArtifact(bundle.note)];
  if (bundle.transcript) {
    artifacts.push(mapTranscriptArtifact(bundle.transcript));
  }
  artifacts.push(...bundle.decisions.map(mapDecisionArtifact));
  artifacts.push(...bundle.actionItems.map(mapActionItemArtifact));
  artifacts.push(...bundle.entities.map(mapEntityArtifact));

  return {
    artifacts,
    metadata: {
      createdAt: bundle.meeting.createdAt,
      folders: bundle.meeting.folders.map((folder) => ({ ...folder })),
      meetingDate: bundle.meeting.meetingDate,
      tags: [...bundle.meeting.tags],
      updatedAt: bundle.meeting.updatedAt,
    },
    sourceItemId: bundle.meeting.id,
    sourcePluginId: GRAN_YAZD_SOURCE_ID,
    tags: [...bundle.meeting.tags],
    title: bundle.meeting.title,
    updatedAt: bundle.meeting.updatedAt,
  };
}

function projectedFolderMemberships(bundle: GranolaMeetingBundle): GranolaFolderMembership[] {
  const rawMemberships = bundle.source.document.folderMemberships ?? [];
  if (rawMemberships.length > 0) {
    return rawMemberships.map((folder) => ({ ...folder }));
  }

  return bundle.meeting.meeting.folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
  }));
}

function withProjectedMeetingContext(bundle: GranolaMeetingBundle): GranolaMeetingBundle {
  return {
    ...bundle,
    source: {
      ...bundle.source,
      document: {
        ...bundle.source.document,
        folderMemberships: projectedFolderMemberships(bundle),
        tags: bundle.source.document.tags.length
          ? [...bundle.source.document.tags]
          : [...bundle.meeting.meeting.tags],
      },
    },
  };
}

export function buildGranolaYazdSourceInfo(): GranolaYazdSourceInfo {
  return {
    description: "Granola meetings exposed as a local source for Yazd workflows.",
    id: GRAN_YAZD_SOURCE_ID,
    label: "Gran",
    product: "gran",
  };
}

export function buildGranolaYazdSourceItemSummary(
  meeting: MeetingSummaryRecord,
): GranolaYazdSourceItemSummary {
  return {
    folderIds: meeting.folders.map((folder) => folder.id),
    folderNames: meeting.folders.map((folder) => folder.name),
    id: meeting.id,
    kind: "meeting",
    summary: summariseMeeting(meeting),
    tags: [...meeting.tags],
    title: meeting.title,
    transcriptLoaded: meeting.transcriptLoaded,
    transcriptSegmentCount: meeting.transcriptSegmentCount,
    updatedAt: meeting.updatedAt,
  };
}

export function buildGranolaYazdSourceFetchResult(
  bundle: GranolaMeetingBundle,
): GranolaYazdSourceFetchResult {
  const hydratedBundle = withProjectedMeetingContext(bundle);

  return {
    item: buildGranolaYazdSourceItemSummary(hydratedBundle.meeting.meeting),
    markdown: hydratedBundle.meeting.noteMarkdown,
    metadata: {
      folders: hydratedBundle.meeting.meeting.folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
      })),
      meetingDate:
        hydratedBundle.source.document.calendarEvent?.startTime?.slice(0, 10) ||
        hydratedBundle.source.document.createdAt.slice(0, 10),
      note: {
        contentSource: hydratedBundle.meeting.note.contentSource,
        createdAt: hydratedBundle.meeting.note.createdAt,
        id: hydratedBundle.meeting.note.id,
        updatedAt: hydratedBundle.meeting.note.updatedAt,
      },
      transcript: hydratedBundle.meeting.transcript
        ? {
            createdAt: hydratedBundle.meeting.transcript.createdAt,
            id: hydratedBundle.meeting.transcript.id,
            segmentCount: hydratedBundle.meeting.transcript.segments.length,
            speakers: hydratedBundle.meeting.transcript.speakers.map((speaker) => speaker.label),
            updatedAt: hydratedBundle.meeting.transcript.updatedAt,
          }
        : null,
    },
    text: hydratedBundle.meeting.note.content,
  };
}

export function buildGranolaYazdArtifactBundle(
  bundle: GranolaMeetingBundle,
): GranolaYazdArtifactBundle {
  return mapArtifactBundle(buildMeetingPkmArtifactBundle(withProjectedMeetingContext(bundle)));
}

export function buildGranolaYazdAutomationArtifactBundle(options: {
  artefact: GranolaAutomationArtefact;
  bundle: GranolaMeetingBundle;
}): GranolaYazdArtifactBundle {
  const hydratedBundle = withProjectedMeetingContext(options.bundle);
  const meetingBundle = buildMeetingPkmArtifactBundle(hydratedBundle, {
    artefacts: [options.artefact],
  });
  const projection = buildPkmAutomationArtefactProjection(options.artefact);
  const artifacts: GranolaYazdArtifact[] = [
    mapAutomationNoteArtifact(options.artefact, projection.provenance),
  ];

  if (meetingBundle.transcript) {
    artifacts.push(mapTranscriptArtifact(meetingBundle.transcript));
  }

  artifacts.push(...projection.decisions.map(mapDecisionArtifact));
  artifacts.push(...projection.actionItems.map(mapActionItemArtifact));
  artifacts.push(
    ...meetingBundle.entities
      .filter((artifact) => artifact.provenance.sourceKind !== "gran-meeting")
      .map(mapEntityArtifact),
  );

  return {
    artifacts,
    metadata: {
      actionId: options.artefact.actionId,
      artefactId: options.artefact.id,
      artefactKind: options.artefact.kind,
      createdAt: meetingBundle.meeting.createdAt,
      folders: meetingBundle.meeting.folders.map((folder) => ({ ...folder })),
      meetingDate: meetingBundle.meeting.meetingDate,
      meetingTitle: meetingBundle.meeting.title,
      ruleId: options.artefact.ruleId,
      tags: [...meetingBundle.meeting.tags],
      updatedAt: options.artefact.updatedAt,
    },
    sourceItemId: meetingBundle.meeting.id,
    sourcePluginId: GRAN_YAZD_SOURCE_ID,
    tags: [...meetingBundle.meeting.tags],
    title: options.artefact.structured.title || meetingBundle.meeting.title,
    updatedAt: options.artefact.updatedAt,
  };
}

export function buildGranolaYazdSourceChange(event: GranolaAppSyncEvent): GranolaYazdSourceChange {
  let kind: GranolaYazdSourceChange["kind"];
  switch (event.kind) {
    case "meeting.created":
      kind = "created";
      break;
    case "meeting.removed":
      kind = "deleted";
      break;
    case "meeting.changed":
      kind = "updated";
      break;
    case "transcript.ready":
    default:
      kind = "transcript-ready";
      break;
  }

  return {
    happenedAt: event.occurredAt,
    id: event.id,
    itemId: event.meetingId,
    kind,
    title: event.title,
  };
}
