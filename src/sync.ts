import type { MeetingSummaryRecord } from "./app/models.ts";
import type { GranolaAppSyncChange, GranolaAppSyncSummary } from "./app/types.ts";

function normaliseMeeting(meeting: MeetingSummaryRecord): Record<string, unknown> {
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

function meetingChanged(previous: MeetingSummaryRecord, next: MeetingSummaryRecord): boolean {
  return JSON.stringify(normaliseMeeting(previous)) !== JSON.stringify(normaliseMeeting(next));
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
