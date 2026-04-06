import {
  cloneFolderSummaryRecord,
  cloneMeetingSummaryRecord,
  normaliseMeetingSummaryRecord,
} from "./app/meeting-read-model.ts";
import type { MeetingSummaryRecord } from "./app/models.ts";
import type {
  GranolaAppSyncChange,
  GranolaAppSyncEvent,
  GranolaAppSyncSummary,
} from "./app/types.ts";

function meetingChanged(previous: MeetingSummaryRecord, next: MeetingSummaryRecord): boolean {
  return (
    JSON.stringify(normaliseMeetingSummaryRecord(previous)) !==
    JSON.stringify(normaliseMeetingSummaryRecord(next))
  );
}

export function diffMeetingSummaries(
  previous: MeetingSummaryRecord[],
  next: MeetingSummaryRecord[],
  folderCount: number,
): {
  changes: GranolaAppSyncChange[];
  summary: GranolaAppSyncSummary;
} {
  const previousById = new Map(previous.map((meeting) => [meeting.id, meeting] as const));
  const nextById = new Map(next.map((meeting) => [meeting.id, meeting] as const));
  const changes: GranolaAppSyncChange[] = [];
  let createdCount = 0;
  let changedCount = 0;
  let removedCount = 0;
  let transcriptReadyCount = 0;

  for (const meeting of next) {
    const previousMeeting = previousById.get(meeting.id);
    if (!previousMeeting) {
      createdCount += 1;
      changes.push({
        kind: "created",
        meetingId: meeting.id,
        title: meeting.title,
        updatedAt: meeting.updatedAt,
      });
      if (meeting.transcriptLoaded) {
        transcriptReadyCount += 1;
        changes.push({
          kind: "transcript-ready",
          meetingId: meeting.id,
          title: meeting.title,
          updatedAt: meeting.updatedAt,
        });
      }
      continue;
    }

    if (meetingChanged(previousMeeting, meeting)) {
      changedCount += 1;
      changes.push({
        kind: "changed",
        meetingId: meeting.id,
        previousUpdatedAt: previousMeeting.updatedAt,
        title: meeting.title,
        updatedAt: meeting.updatedAt,
      });
    }

    if (!previousMeeting.transcriptLoaded && meeting.transcriptLoaded) {
      transcriptReadyCount += 1;
      changes.push({
        kind: "transcript-ready",
        meetingId: meeting.id,
        previousUpdatedAt: previousMeeting.updatedAt,
        title: meeting.title,
        updatedAt: meeting.updatedAt,
      });
    }
  }

  for (const meeting of previous) {
    if (nextById.has(meeting.id)) {
      continue;
    }

    removedCount += 1;
    changes.push({
      kind: "removed",
      meetingId: meeting.id,
      previousUpdatedAt: meeting.updatedAt,
      title: meeting.title,
    });
  }

  return {
    changes,
    summary: {
      changedCount,
      createdCount,
      folderCount,
      meetingCount: next.length,
      removedCount,
      transcriptReadyCount,
    },
  };
}

export function buildSyncEvents(
  runId: string,
  occurredAt: string,
  changes: GranolaAppSyncChange[],
  previousMeetings: MeetingSummaryRecord[],
  nextMeetings: MeetingSummaryRecord[],
): GranolaAppSyncEvent[] {
  const previousById = new Map(
    previousMeetings.map((meeting) => [meeting.id, cloneMeetingSummaryRecord(meeting)] as const),
  );
  const nextById = new Map(
    nextMeetings.map((meeting) => [meeting.id, cloneMeetingSummaryRecord(meeting)] as const),
  );

  return changes.map((change, index) => ({
    folders:
      (change.kind === "removed"
        ? previousById.get(change.meetingId)
        : nextById.get(change.meetingId)
      )?.folders.map((folder) => cloneFolderSummaryRecord(folder)) ?? [],
    id: `${runId}:${index + 1}`,
    kind:
      change.kind === "created"
        ? "meeting.created"
        : change.kind === "changed"
          ? "meeting.changed"
          : change.kind === "removed"
            ? "meeting.removed"
            : "transcript.ready",
    meetingId: change.meetingId,
    occurredAt,
    previousUpdatedAt: change.previousUpdatedAt,
    runId,
    tags:
      (change.kind === "removed"
        ? previousById.get(change.meetingId)
        : nextById.get(change.meetingId)
      )?.tags.slice() ?? [],
    title: change.title,
    transcriptLoaded:
      (change.kind === "removed"
        ? previousById.get(change.meetingId)
        : nextById.get(change.meetingId)
      )?.transcriptLoaded ?? false,
    updatedAt: change.updatedAt,
  }));
}
