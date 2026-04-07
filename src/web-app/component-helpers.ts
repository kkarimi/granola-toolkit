import type {
  FolderSummaryRecord,
  GranolaAppState,
  GranolaExportScope,
  GranolaMeetingBundle,
  GranolaProcessingIssue,
  MeetingRecord,
  MeetingSummaryRecord,
} from "../app/index.ts";
import type { GranolaReviewInboxSummary } from "../review-inbox.ts";
import type { GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import { exportScopeLabel, parseWorkspaceTab, type WorkspaceTab } from "../web/client-state.ts";

export type WebAsyncViewState = "content" | "empty" | "error" | "loading";

export function resolveAsyncViewState(options: {
  count: number;
  error?: string;
  loading?: boolean;
}): WebAsyncViewState {
  if (options.loading && options.count === 0) {
    return "loading";
  }

  if (options.error) {
    return "error";
  }

  if (options.count > 0) {
    return "content";
  }

  return "empty";
}

export function resolveMeetingWorkspaceState(options: {
  detailError?: string;
  hasMeeting: boolean;
  loading?: boolean;
}): WebAsyncViewState {
  if (options.loading && !options.hasMeeting) {
    return "loading";
  }

  if (options.detailError) {
    return "error";
  }

  if (options.hasMeeting) {
    return "content";
  }

  return "empty";
}

export function metadataLines(record: MeetingRecord, bundle?: GranolaMeetingBundle | null): string {
  const transcriptStatus = record.meeting.transcriptLoaded
    ? `${record.meeting.transcriptSegmentCount} segments`
    : "not loaded yet";
  return [
    `Title: ${record.meeting.title || record.meeting.id}`,
    `Meeting date: ${formatDateLabel(record.meeting.createdAt)}`,
    `Last updated: ${record.meeting.updatedAt}`,
    `Folders: ${meetingFolderSummary(record, bundle)}`,
    `Tags: ${record.meeting.tags.length ? record.meeting.tags.join(", ") : "none"}`,
    `Note source: ${noteSourceLabel(record.meeting.noteContentSource)}`,
    `Transcript: ${transcriptStatus}`,
    `Owner candidates: ${
      record.roleHelpers.ownerCandidates.length
        ? record.roleHelpers.ownerCandidates.map((candidate) => candidate.label).join(", ")
        : "none"
    }`,
    `Speakers: ${
      record.roleHelpers.speakers.length
        ? record.roleHelpers.speakers
            .map((speaker) => `${speaker.label} (${speaker.segmentCount})`)
            .join(", ")
        : "none"
    }`,
  ].join("\n");
}

export function workspaceBody(
  bundle: GranolaMeetingBundle | null,
  record: MeetingRecord,
  tab: WorkspaceTab,
): { body: string; description: string; title: string } {
  switch (tab) {
    case "transcript":
      return {
        body: record.transcriptText || "(Transcript unavailable)",
        description: record.meeting.transcriptLoaded
          ? "Transcript view keeps the full conversation in one continuous reading surface."
          : "Granola has not finished loading the transcript for this meeting yet.",
        title: "Transcript",
      };
    case "metadata":
      return {
        body: metadataLines(record, bundle),
        description:
          "Metadata keeps meeting facts, note provenance, and local inference hints together.",
        title: "Metadata",
      };
    case "raw":
      return {
        body: JSON.stringify(bundle || record, null, 2),
        description:
          "Raw bundle is the structured payload for debugging, automation, and schema inspection.",
        title: "Raw Bundle",
      };
    default:
      return {
        body: record.note.content || "(No notes available)",
        description: "Notes view shows the readable meeting note without export front matter.",
        title: "Notes",
      };
  }
}

export function scopeLabel(scope: GranolaExportScope): string {
  return exportScopeLabel(scope);
}

export function formatDateLabel(value?: string): string {
  if (!value) {
    return "Unknown date";
  }

  return value.slice(0, 10);
}

export function formatFolderNames(folders: FolderSummaryRecord[]): string {
  if (folders.length === 0) {
    return "Folder unknown";
  }

  return folders.map((folder) => folder.name || folder.id).join(", ");
}

function bundleFolderNames(bundle?: GranolaMeetingBundle | null): string[] {
  const names = (bundle?.source.document.folderMemberships ?? [])
    .map((folder) => folder.name || folder.id)
    .filter(Boolean);
  return [...new Set(names)];
}

export function meetingFolderSummary(
  record: MeetingRecord,
  bundle?: GranolaMeetingBundle | null,
  fallbackFolderLabel?: string | null,
): string {
  const projected = record.meeting.folders
    .map((folder) => folder.name || folder.id)
    .filter(Boolean);
  if (projected.length > 0) {
    return [...new Set(projected)].join(", ");
  }

  const fallbackNames = bundleFolderNames(bundle);
  if (fallbackNames.length > 0) {
    return fallbackNames.join(", ");
  }

  if (fallbackFolderLabel?.trim()) {
    return fallbackFolderLabel.trim();
  }

  return "Folder unknown";
}

export function noteSourceLabel(source: MeetingRecord["meeting"]["noteContentSource"]): string {
  switch (source) {
    case "notes":
      return "Granola notes";
    case "lastViewedPanel.content":
      return "Rendered note panel";
    case "lastViewedPanel.originalContent":
      return "Original note panel";
    case "content":
    default:
      return "Document content";
  }
}

export function tagSummary(tags: string[]): string {
  if (tags.length === 0) {
    return "No tags";
  }

  return tags.map((tag) => `#${tag}`).join(" ");
}

export function ownerSummary(record: MeetingRecord): string {
  if (record.roleHelpers.ownerCandidates.length === 0) {
    return "No clear owner candidates";
  }

  return record.roleHelpers.ownerCandidates
    .slice(0, 3)
    .map((candidate) => candidate.label)
    .join(", ");
}

export function speakerSummary(record: MeetingRecord): string {
  if (record.roleHelpers.speakers.length === 0) {
    return "No speaker breakdown yet";
  }

  return record.roleHelpers.speakers
    .slice(0, 3)
    .map((speaker) => `${speaker.label} (${speaker.segmentCount})`)
    .join(", ");
}

export function meetingContextSummary(
  record: MeetingRecord,
  bundle?: GranolaMeetingBundle | null,
  fallbackFolderLabel?: string | null,
): string {
  const transcriptLabel = record.meeting.transcriptLoaded
    ? `${record.meeting.transcriptSegmentCount} transcript segments`
    : "Transcript on demand";
  return `${formatDateLabel(record.meeting.createdAt)} • ${meetingFolderSummary(record, bundle, fallbackFolderLabel)} • ${transcriptLabel}`;
}

export function parseTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function meetingTimestamp(meeting: MeetingSummaryRecord): number | null {
  return parseTimestamp(meeting.updatedAt) ?? parseTimestamp(meeting.createdAt);
}

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function relativeDateLabel(value?: string): string {
  const timestamp = parseTimestamp(value);
  if (timestamp == null) {
    return "Unknown date";
  }

  const diffDays = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (diffDays === 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  return `${diffDays} days ago`;
}

export function meetingsWithinDays(
  meetings: MeetingSummaryRecord[],
  dayCount: number,
): MeetingSummaryRecord[] {
  const threshold = startOfDay(Date.now()) - (dayCount - 1) * 86_400_000;
  return meetings.filter((meeting) => {
    const timestamp = meetingTimestamp(meeting);
    return timestamp != null && timestamp >= threshold;
  });
}

export function meetingsPerDay(
  meetings: MeetingSummaryRecord[],
  dayCount: number,
): Array<{
  count: number;
  label: string;
}> {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: dayCount }, (_, index) => {
    const timestamp = today - (dayCount - index - 1) * 86_400_000;
    return {
      count: 0,
      label: dayLabel(timestamp),
      timestamp,
    };
  });

  for (const meeting of meetings) {
    const timestamp = meetingTimestamp(meeting);
    if (timestamp == null) {
      continue;
    }

    const meetingDay = startOfDay(timestamp);
    const entry = days.find((candidate) => candidate.timestamp === meetingDay);
    if (entry) {
      entry.count += 1;
    }
  }

  return days.map(({ count, label }) => ({ count, label }));
}

export function latestFolderNames(meeting: MeetingSummaryRecord): string {
  if (meeting.folders.length === 0) {
    return "Folder unknown";
  }

  return meeting.folders.map((folder) => folder.name || folder.id).join(", ");
}

export function reviewSummaryLabel(summary: GranolaReviewInboxSummary): string {
  if (summary.total === 0) {
    return "Nothing waiting for review";
  }

  return `${summary.total} items need review`;
}

export function runtimeLabel(serverInfo?: GranolaServerInfo | null): string {
  if (!serverInfo) {
    return "Connecting to local service";
  }

  if (!serverInfo.runtime.syncEnabled) {
    return "Local session";
  }

  if (serverInfo.runtime.mode === "background-service") {
    if (serverInfo.runtime.syncIntervalMs) {
      const minutes = Math.max(1, Math.round(serverInfo.runtime.syncIntervalMs / 60_000));
      return `Background sync every ${minutes} min`;
    }

    return "Background sync active";
  }

  return "Connected to local workspace";
}

export function buildIdentityLabel(serverInfo?: GranolaServerInfo | null): string {
  if (!serverInfo) {
    return "Detecting build";
  }

  const version = serverInfo.build.version?.trim()
    ? `v${serverInfo.build.version.trim()}`
    : "unknown";
  return serverInfo.build.gitCommitShort
    ? `${version} · ${serverInfo.build.gitCommitShort}`
    : version;
}

export function buildStartedAtLabel(serverInfo?: GranolaServerInfo | null): string {
  const startedAt = serverInfo?.runtime.startedAt;
  if (!startedAt?.trim()) {
    return "not recorded";
  }

  return startedAt.replace("T", " ").slice(0, 19);
}

export function formatDateTimeLabel(value?: string): string {
  if (!value?.trim()) {
    return "Not recorded";
  }

  return value.replace("T", " ").slice(0, 19);
}

export function compactPathLabel(value?: string | null): string {
  if (!value?.trim()) {
    return "Not configured";
  }

  const normalised = value.replaceAll("\\", "/");
  const parts = normalised.split("/").filter(Boolean);
  if (parts.length <= 3) {
    return normalised;
  }

  return `.../${parts.slice(-3).join("/")}`;
}

export function syncCadenceLabel(serverInfo?: GranolaServerInfo | null): string {
  if (!serverInfo?.runtime.syncEnabled) {
    return "Manual sync only";
  }

  const intervalMs = serverInfo.runtime.syncIntervalMs;
  if (!intervalMs || intervalMs <= 0) {
    return "Background sync enabled";
  }

  const totalMinutes = Math.max(1, Math.round(intervalMs / 60_000));
  if (totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60;
    return `Background sync every ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `Background sync every ${totalMinutes} min`;
}

export function providerSetupHint(provider: GranolaAgentProviderKind): string {
  switch (provider) {
    case "codex":
      return "Codex uses your local `codex` CLI. Make sure `codex exec` works anywhere you run sync and automation.";
    case "openai":
      return "OpenAI needs `OPENAI_API_KEY` or `GRANOLA_OPENAI_API_KEY` in the toolkit runtime environment.";
    case "openrouter":
    default:
      return "OpenRouter needs `OPENROUTER_API_KEY` or `GRANOLA_OPENROUTER_API_KEY` in the toolkit runtime environment.";
  }
}

export function syncHealthSummary(
  sync: GranolaAppState["sync"] | undefined,
  serverInfo?: GranolaServerInfo | null,
  issues: GranolaProcessingIssue[] = [],
): { detail: string; title: string; tone: "ok" | "warning" } {
  if (sync?.lastError) {
    return {
      detail: sync.lastError,
      title: "Sync needs attention",
      tone: "warning",
    };
  }

  const staleIssue = issues.find((issue) => issue.kind === "sync-stale");
  if (staleIssue) {
    return {
      detail: staleIssue.detail,
      title: "Sync looks stale",
      tone: "warning",
    };
  }

  if (sync?.lastCompletedAt) {
    const cadence =
      serverInfo?.runtime.syncEnabled && serverInfo.runtime.syncIntervalMs
        ? ` Next scheduled run follows the ${runtimeLabel(serverInfo).toLowerCase()} cadence.`
        : "";
    return {
      detail: `Last completed at ${sync.lastCompletedAt.slice(0, 19)}.${cadence}`,
      title: "Sync is healthy",
      tone: "ok",
    };
  }

  return {
    detail:
      "Run Sync now after connecting so the local meeting index and review queue can warm up.",
    title: "No sync has completed yet",
    tone: "warning",
  };
}

export function parsedWorkspaceTab(tab: WorkspaceTab): WorkspaceTab {
  return parseWorkspaceTab(tab);
}
