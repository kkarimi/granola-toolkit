import type {
  GranolaAppState,
  GranolaMeetingBundle,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";
import { renderMeetingNotes, renderMeetingTranscript } from "../meetings.ts";

import type { GranolaTuiWorkspaceTab } from "./types.ts";

export interface GranolaTuiQuickOpenItem {
  actionId?: GranolaTuiQuickOpenActionId;
  description: string;
  id: string;
  kind: "action" | "meeting";
  label: string;
  score: number;
}

export type GranolaTuiQuickOpenActionId = "auth" | "automation" | "clear-scope" | "sync";

function splitQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function scoreMeetingTerm(meeting: MeetingSummaryRecord, term: string): number | undefined {
  const title = meeting.title.toLowerCase();
  const id = meeting.id.toLowerCase();
  const tags = meeting.tags.map((tag) => tag.toLowerCase());

  if (title === term || id === term) {
    return 0;
  }

  if (title.startsWith(term)) {
    return 1;
  }

  if (id.startsWith(term)) {
    return 2;
  }

  if (title.includes(term)) {
    return 3;
  }

  if (id.includes(term)) {
    return 4;
  }

  if (tags.some((tag) => tag.includes(term))) {
    return 5;
  }

  return undefined;
}

export function buildGranolaTuiQuickOpenItems(
  meetings: MeetingSummaryRecord[],
  query: string,
  options: {
    includeActions?: boolean;
    recentMeetingIds?: string[];
  } = {},
): GranolaTuiQuickOpenItem[] {
  const terms = splitQuery(query);
  const recentMeetingIds = options.recentMeetingIds ?? [];
  const recentMeetingIndex = new Map(recentMeetingIds.map((id, index) => [id, index]));
  const items: GranolaTuiQuickOpenItem[] = meetings
    .map<GranolaTuiQuickOpenItem | undefined>((meeting) => {
      const score = terms.reduce<number | undefined>((current, term) => {
        const termScore = scoreMeetingTerm(meeting, term);
        if (termScore === undefined) {
          return undefined;
        }

        return (current ?? 0) + termScore;
      }, 0);

      if (terms.length > 0 && score === undefined) {
        return undefined;
      }

      const tags =
        meeting.tags.length > 0 ? meeting.tags.map((tag) => `#${tag}`).join(" ") : "untagged";
      const recentIndex = recentMeetingIndex.get(meeting.id);
      const recencyScore = recentIndex === undefined ? 0 : -20 + recentIndex;
      const recentPrefix = recentIndex === undefined ? "" : "Recent · ";

      return {
        description: `${recentPrefix}${meeting.updatedAt.slice(0, 10)} | ${tags} | ${meeting.id}`,
        id: meeting.id,
        kind: "meeting",
        label: meeting.title || meeting.id,
        score: (score ?? 99) + recencyScore,
      };
    })
    .filter((item): item is GranolaTuiQuickOpenItem => item !== undefined);

  if (options.includeActions !== false) {
    const actions: Array<{
      description: string;
      id: GranolaTuiQuickOpenActionId;
      keywords: string[];
      label: string;
    }> = [
      {
        description: "Trigger a foreground sync refresh",
        id: "sync",
        keywords: ["sync", "refresh", "reload"],
        label: "Sync now",
      },
      {
        description: "Open auth controls for API key and session switching",
        id: "auth",
        keywords: ["auth", "session", "login", "api"],
        label: "Auth session",
      },
      {
        description: "Review recent automation runs",
        id: "automation",
        keywords: ["automation", "runs", "actions"],
        label: "Automation runs",
      },
      {
        description: "Clear the current folder scope and show all meetings",
        id: "clear-scope",
        keywords: ["all", "scope", "folder", "clear"],
        label: "All meetings",
      },
    ];

    for (const action of actions) {
      const score = terms.reduce<number | undefined>((current, term) => {
        const matched = [action.label, ...action.keywords].some((value) =>
          value.toLowerCase().includes(term),
        );
        if (!matched) {
          return undefined;
        }

        return (current ?? 0) - 50;
      }, 0);

      if (terms.length > 0 && score === undefined) {
        continue;
      }

      items.push({
        actionId: action.id,
        description: action.description,
        id: action.id,
        kind: "action",
        label: action.label,
        score: score ?? -40,
      });
    }
  }

  return items.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    if (left.description !== right.description) {
      return right.description.localeCompare(left.description);
    }

    return left.label.localeCompare(right.label);
  });
}

export function renderGranolaTuiMeetingTab(
  bundle: GranolaMeetingBundle,
  tab: GranolaTuiWorkspaceTab,
): string {
  const summary = bundle.meeting.meeting;

  switch (tab) {
    case "metadata":
      return [
        `Title: ${summary.title || summary.id}`,
        `ID: ${summary.id}`,
        `Created: ${summary.createdAt}`,
        `Updated: ${summary.updatedAt}`,
        `Folders: ${summary.folders.length > 0 ? summary.folders.map((folder) => folder.name).join(", ") : "none"}`,
        `Tags: ${summary.tags.length > 0 ? summary.tags.join(", ") : "none"}`,
        `Notes source: ${summary.noteContentSource}`,
        `Transcript loaded: ${summary.transcriptLoaded ? "yes" : "no"}`,
        `Transcript segments: ${summary.transcriptSegmentCount}`,
      ].join("\n");
    case "raw":
      return JSON.stringify(bundle, null, 2);
    case "transcript": {
      const transcript = renderMeetingTranscript(bundle.document, bundle.cacheData, "text").trim();
      if (transcript) {
        return transcript;
      }

      return bundle.cacheData ? "(Transcript unavailable)" : "(Granola cache not loaded)";
    }
    case "notes":
    default:
      return renderMeetingNotes(bundle.document, "markdown").trim();
  }
}

export function buildGranolaTuiSummary(
  state: GranolaAppState,
  meetingSource: MeetingSummarySource,
): string {
  const authMode =
    state.auth.mode === "api-key"
      ? "API key"
      : state.auth.mode === "stored-session"
        ? "stored session"
        : "supabase.json";
  const documents = state.documents.loaded
    ? `${state.documents.count} documents`
    : "documents pending";
  const folders = state.folders.loaded ? `${state.folders.count} folders` : "folders pending";
  const cache = state.cache.loaded
    ? `${state.cache.transcriptCount} transcript sets`
    : state.cache.configured
      ? "cache configured"
      : "cache missing";
  const index = state.index.loaded ? `${state.index.meetingCount} indexed` : "index pending";
  const sync = state.sync.running
    ? "sync running"
    : state.sync.lastError
      ? "sync needs attention"
      : state.sync.lastCompletedAt
        ? `synced ${state.sync.lastCompletedAt.slice(11, 16)}`
        : "sync idle";
  const automation = state.automation.pendingRunCount
    ? `${state.automation.pendingRunCount} pending`
    : state.automation.runCount
      ? `${state.automation.runCount} runs`
      : "automation idle";

  return `auth ${authMode} | ${documents} | ${folders} | ${cache} | ${index} | ${sync} | ${automation} | source ${meetingSource}`;
}
