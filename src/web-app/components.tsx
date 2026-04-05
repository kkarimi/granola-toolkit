/** @jsxImportSource solid-js */

import { For, Show, type JSX } from "solid-js";

import type {
  GranolaAutomationArtefact,
  GranolaAutomationActionRun,
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppState,
  GranolaExportScope,
  FolderSummaryRecord,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  GranolaProcessingIssue,
  MeetingRecord,
  MeetingSummaryRecord,
} from "../app/index.ts";
import { granolaAgentProviderLabel } from "../agent-defaults.ts";
import { granolaAuthModeLabel, granolaAuthRecommendation } from "../auth-summary.ts";
import type { GranolaReviewInboxItem, GranolaReviewInboxSummary } from "../review-inbox.ts";
import type { GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import {
  describeAuthStatus,
  describeSyncStatus,
  currentFilterSummary,
  exportScopeLabel,
  hasActiveFilters,
  parseWorkspaceTab,
  type WebWorkspaceRecentMeeting,
  type WebWorkspaceSavedFilter,
  type WorkspaceTab,
} from "../web/client-state.ts";

export type WebStatusTone = "busy" | "error" | "idle" | "ok";
export type WebMainPage = "folders" | "home" | "meeting" | "review" | "search" | "settings";
export type WebSettingsSection = "auth" | "diagnostics" | "exports" | "pipelines";

type WebNavigationPage = Exclude<WebMainPage, "meeting">;

interface PrimaryNavProps {
  activePage: WebMainPage;
  folderCount: number;
  onNavigate: (page: WebNavigationPage) => void;
  onSync: () => void;
  reviewSummary: GranolaReviewInboxSummary;
  statusLabel: string;
  statusTone: WebStatusTone;
}

interface PageHeaderProps {
  actions?: JSX.Element;
  description: string;
  eyebrow?: string;
  title: string;
}

interface SearchWorkspacePanelProps {
  advancedQuery: string;
  onAdvancedQueryChange: (value: string) => void;
  onClear: () => void;
  onOpenAdvanced: () => void;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  onSortChange: (value: GranolaMeetingSort) => void;
  onUpdatedFromChange: (value: string) => void;
  onUpdatedToChange: (value: string) => void;
  query: string;
  sort: GranolaMeetingSort;
  updatedFrom: string;
  updatedTo: string;
}

interface ToolbarFiltersProps {
  onSearchInput: (value: string) => void;
  onSortChange: (value: GranolaMeetingSort) => void;
  onUpdatedFromChange: (value: string) => void;
  onUpdatedToChange: (value: string) => void;
  search: string;
  sort: GranolaMeetingSort;
  updatedFrom: string;
  updatedTo: string;
}

interface FolderListProps {
  error?: string;
  folders: FolderSummaryRecord[];
  onSelect: (folderId: string | null) => void;
  selectedFolderId?: string | null;
}

interface SavedFiltersPanelProps {
  folders: FolderSummaryRecord[];
  onApply: (filter: WebWorkspaceSavedFilter) => void;
  onRemove: (id: string) => void;
  onSaveCurrent: () => void;
  savedFilters: WebWorkspaceSavedFilter[];
  search: string;
  selectedFolderId?: string | null;
  sort: GranolaMeetingSort;
  updatedFrom: string;
  updatedTo: string;
}

interface RecentMeetingsPanelProps {
  onOpen: (meeting: WebWorkspaceRecentMeeting) => void;
  recentMeetings: WebWorkspaceRecentMeeting[];
}

interface MeetingListProps {
  description?: string;
  error?: string;
  emptyHint?: string;
  folders: FolderSummaryRecord[];
  heading?: string;
  meetings: MeetingSummaryRecord[];
  onSelect: (meetingId: string) => void;
  search: string;
  selectedFolderId?: string | null;
  selectedMeetingId?: string | null;
  updatedFrom: string;
  updatedTo: string;
}

interface HomeDashboardPanelProps {
  appState?: GranolaAppState | null;
  folders: FolderSummaryRecord[];
  onOpenFolder: (folderId: string) => void;
  onOpenLatestMeeting: (meeting: MeetingSummaryRecord) => void;
  onOpenMeeting: (meeting: WebWorkspaceRecentMeeting) => void;
  onOpenReview: () => void;
  latestMeetings: MeetingSummaryRecord[];
  processingIssues: GranolaProcessingIssue[];
  recentMeetings: WebWorkspaceRecentMeeting[];
  reviewSummary: GranolaReviewInboxSummary;
  serverInfo?: GranolaServerInfo | null;
}

interface AuthPanelProps {
  apiKeyDraft: string;
  auth?: GranolaAppAuthState;
  onApiKeyDraftChange: (value: string) => void;
  onImportDesktopSession: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onSaveApiKey: () => void;
  onSwitchMode: (mode: GranolaAppAuthState["mode"]) => void;
  preferredProvider: GranolaAgentProviderKind;
}

interface SecurityPanelProps {
  onLock: () => void;
  onPasswordChange: (value: string) => void;
  onUnlock: () => void;
  password: string;
  visible: boolean;
}

interface ExportJobsPanelProps {
  jobs: GranolaAppExportJobState[];
  onRerun: (id: string) => void;
}

interface AutomationRunsPanelProps {
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  runs: GranolaAutomationActionRun[];
}

interface ProcessingIssuesPanelProps {
  issues: GranolaProcessingIssue[];
  onOpenMeeting: (meetingId: string) => void;
  onRecover: (id: string) => void;
}

interface AutomationArtefactsPanelProps {
  artefacts: GranolaAutomationArtefact[];
  onSelect: (id: string) => void;
  selectedArtefactId?: string | null;
}

interface ReviewInboxPanelProps {
  items: GranolaReviewInboxItem[];
  onSelect: (key: string) => void;
  selectedKey?: string | null;
  summary: GranolaReviewInboxSummary;
}

interface ArtefactReviewPanelProps {
  artefact: GranolaAutomationArtefact | null;
  bundle: GranolaMeetingBundle | null;
  draftMarkdown: string;
  draftSummary: string;
  draftTitle: string;
  error?: string;
  onApprove: () => void;
  onDraftMarkdownChange: (value: string) => void;
  onDraftSummaryChange: (value: string) => void;
  onDraftTitleChange: (value: string) => void;
  onReject: () => void;
  onRerun: () => void;
  onReviewNoteChange: (value: string) => void;
  onSave: () => void;
  reviewNote: string;
}

interface WorkspaceProps {
  bundle: GranolaMeetingBundle | null;
  detailError?: string;
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedMeeting: MeetingRecord | null;
  tab: WorkspaceTab;
}

function metadataLines(record: MeetingRecord): string {
  return [
    `Title: ${record.meeting.title || record.meeting.id}`,
    `Created: ${record.meeting.createdAt}`,
    `Updated: ${record.meeting.updatedAt}`,
    `Folders: ${
      record.meeting.folders.length
        ? record.meeting.folders.map((folder) => folder.name).join(", ")
        : "none"
    }`,
    `Tags: ${record.meeting.tags.length ? record.meeting.tags.join(", ") : "none"}`,
    `Transcript loaded: ${record.meeting.transcriptLoaded ? "yes" : "no"}`,
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

function workspaceBody(
  bundle: GranolaMeetingBundle | null,
  record: MeetingRecord,
  tab: WorkspaceTab,
): { body: string; title: string } {
  switch (tab) {
    case "transcript":
      return {
        body: record.transcriptText || "(Transcript unavailable)",
        title: "Transcript",
      };
    case "metadata":
      return {
        body: metadataLines(record),
        title: "Metadata",
      };
    case "raw":
      return {
        body: JSON.stringify(bundle || record, null, 2),
        title: "Raw Bundle",
      };
    default:
      return {
        body: record.noteMarkdown || "(No notes available)",
        title: "Notes",
      };
  }
}

function scopeLabel(scope: GranolaExportScope): string {
  return exportScopeLabel(scope);
}

function formatDateLabel(value?: string): string {
  if (!value) {
    return "Unknown date";
  }

  return value.slice(0, 10);
}

function formatFolderNames(folders: FolderSummaryRecord[]): string {
  if (folders.length === 0) {
    return "No folder";
  }

  return folders.map((folder) => folder.name || folder.id).join(", ");
}

function parseTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function meetingTimestamp(meeting: MeetingSummaryRecord): number | null {
  return parseTimestamp(meeting.updatedAt) ?? parseTimestamp(meeting.createdAt);
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dayLabel(timestamp: number): string {
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

function relativeDateLabel(value?: string): string {
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

function meetingsWithinDays(
  meetings: MeetingSummaryRecord[],
  dayCount: number,
): MeetingSummaryRecord[] {
  const threshold = startOfDay(Date.now()) - (dayCount - 1) * 86_400_000;
  return meetings.filter((meeting) => {
    const timestamp = meetingTimestamp(meeting);
    return timestamp != null && timestamp >= threshold;
  });
}

function meetingsPerDay(
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

function latestFolderNames(meeting: MeetingSummaryRecord): string {
  if (meeting.folders.length === 0) {
    return "No folder";
  }

  return meeting.folders.map((folder) => folder.name || folder.id).join(", ");
}

function reviewSummaryLabel(summary: GranolaReviewInboxSummary): string {
  if (summary.total === 0) {
    return "Nothing waiting for review";
  }

  return `${summary.total} items need review`;
}

function runtimeLabel(serverInfo?: GranolaServerInfo | null): string {
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

function providerSetupHint(provider: GranolaAgentProviderKind): string {
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

function syncHealthSummary(
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

export function ToolbarFilters(props: ToolbarFiltersProps): JSX.Element {
  return (
    <section class="hero">
      <h1>Granola Toolkit</h1>
      <p>
        Start from folders, recent meetings, or search. The browser stays attached to the same local
        service and sync loop as the CLI and TUI.
      </p>
      <input
        class="search"
        onInput={(event) => {
          props.onSearchInput(event.currentTarget.value);
        }}
        placeholder="Search meeting titles, tags, folders, and notes"
        value={props.search}
      />
      <div class="field-row field-row--inline">
        <label>
          <span class="field-label">Sort</span>
          <select
            class="select"
            onChange={(event) => {
              props.onSortChange(event.currentTarget.value as GranolaMeetingSort);
            }}
            value={props.sort}
          >
            <option value="updated-desc">Newest first</option>
            <option value="updated-asc">Oldest first</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
          </select>
        </label>
        <label>
          <span class="field-label">Updated From</span>
          <input
            class="field-input"
            onChange={(event) => {
              props.onUpdatedFromChange(event.currentTarget.value);
            }}
            type="date"
            value={props.updatedFrom}
          />
        </label>
      </div>
      <label class="field-row">
        <span class="field-label">Updated To</span>
        <input
          class="field-input"
          onChange={(event) => {
            props.onUpdatedToChange(event.currentTarget.value);
          }}
          type="date"
          value={props.updatedTo}
        />
      </label>
    </section>
  );
}

export function PrimaryNav(props: PrimaryNavProps): JSX.Element {
  const navItems: Array<{ id: WebNavigationPage; label: string; note: string }> = [
    { id: "home", label: "Home", note: "Overview and next steps" },
    { id: "folders", label: "Folders", note: "Browse meetings from folders" },
    { id: "search", label: "Search", note: "Find one meeting on purpose" },
    { id: "review", label: "Review", note: "Handle approvals and issues" },
    { id: "settings", label: "Settings", note: "Auth, automation, exports, diagnostics" },
  ];

  return (
    <aside class="pane primary-nav">
      <div class="primary-nav__hero">
        <p class="primary-nav__eyebrow">Granola Toolkit</p>
        <h1>Local meeting workspace</h1>
        <p>
          Browse by folder, review what needs attention, and open one meeting at a time when you
          actually need it.
        </p>
      </div>
      <button class="button button--primary" onClick={props.onSync} type="button">
        Sync now
      </button>
      <nav class="primary-nav__links" aria-label="Primary">
        <For each={navItems}>
          {(item) => (
            <button
              class="primary-nav__link"
              data-selected={props.activePage === item.id ? "true" : undefined}
              onClick={() => {
                props.onNavigate(item.id);
              }}
              type="button"
            >
              <span class="primary-nav__link-title">{item.label}</span>
              <span class="primary-nav__link-note">{item.note}</span>
            </button>
          )}
        </For>
      </nav>
      <section class="primary-nav__status">
        <div class="state-badge" data-tone={props.statusTone}>
          {props.statusLabel}
        </div>
        <div class="primary-nav__stat">
          <span class="status-label">Folders</span>
          <strong>{String(props.folderCount)}</strong>
        </div>
        <div class="primary-nav__stat">
          <span class="status-label">Needs review</span>
          <strong>{reviewSummaryLabel(props.reviewSummary)}</strong>
        </div>
      </section>
    </aside>
  );
}

export function PageHeader(props: PageHeaderProps): JSX.Element {
  return (
    <section class="page-header">
      <div>
        <Show when={props.eyebrow}>
          {(eyebrow) => <p class="page-header__eyebrow">{eyebrow()}</p>}
        </Show>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </div>
      <Show when={props.actions}>
        <div class="page-header__actions">{props.actions}</div>
      </Show>
    </section>
  );
}

export function SearchWorkspacePanel(props: SearchWorkspacePanelProps): JSX.Element {
  return (
    <section class="search-panel">
      <div class="search-panel__hero">
        <div>
          <p class="page-header__eyebrow">Search</p>
          <h2>Find the meeting you actually want.</h2>
          <p>
            Search is a dedicated page so the rest of the app can stay calm. Use text search for
            normal browsing and exact open only when you already know the meeting title or id.
          </p>
        </div>
      </div>
      <div class="search-panel__form">
        <input
          class="search"
          onInput={(event) => {
            props.onQueryChange(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              props.onRun();
            }
          }}
          placeholder="Search titles, notes, folders, tags, and transcript text"
          value={props.query}
        />
        <div class="toolbar-actions">
          <button class="button button--primary" onClick={props.onRun} type="button">
            Search
          </button>
          <button class="button button--secondary" onClick={props.onClear} type="button">
            Clear
          </button>
        </div>
      </div>
      <div class="search-panel__filters">
        <label>
          <span class="field-label">Sort</span>
          <select
            class="select"
            onChange={(event) => {
              props.onSortChange(event.currentTarget.value as GranolaMeetingSort);
            }}
            value={props.sort}
          >
            <option value="updated-desc">Newest first</option>
            <option value="updated-asc">Oldest first</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
          </select>
        </label>
        <label>
          <span class="field-label">Updated From</span>
          <input
            class="field-input"
            onChange={(event) => {
              props.onUpdatedFromChange(event.currentTarget.value);
            }}
            type="date"
            value={props.updatedFrom}
          />
        </label>
        <label>
          <span class="field-label">Updated To</span>
          <input
            class="field-input"
            onChange={(event) => {
              props.onUpdatedToChange(event.currentTarget.value);
            }}
            type="date"
            value={props.updatedTo}
          />
        </label>
      </div>
      <section class="advanced-search-panel advanced-search-panel--embedded">
        <div class="advanced-search-panel__head">
          <div>
            <h3>Exact open</h3>
            <p>For the rare case where you already know the exact meeting title or Granola id.</p>
          </div>
        </div>
        <div class="advanced-search-panel__body">
          <input
            class="field-input"
            onInput={(event) => {
              props.onAdvancedQueryChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onOpenAdvanced();
              }
            }}
            placeholder="Exact title or meeting id"
            value={props.advancedQuery}
          />
          <button class="button button--secondary" onClick={props.onOpenAdvanced} type="button">
            Open
          </button>
        </div>
      </section>
    </section>
  );
}

export function HomeDashboardPanel(props: HomeDashboardPanelProps): JSX.Element {
  const syncStatus = () => describeSyncStatus(props.appState?.sync ?? {});
  const authStatus = () => describeAuthStatus(props.appState?.auth);
  const health = () =>
    syncHealthSummary(props.appState?.sync, props.serverInfo, props.processingIssues);
  const latestMeetings = () => props.latestMeetings.slice(0, 4);
  const todayMeetings = () => meetingsWithinDays(props.latestMeetings, 1);
  const weekMeetings = () => meetingsWithinDays(props.latestMeetings, 7);
  const monthMeetings = () => meetingsWithinDays(props.latestMeetings, 30);
  const weekActivity = () => meetingsPerDay(props.latestMeetings, 7);
  const activeFolderCount = () =>
    new Set(
      weekMeetings()
        .flatMap((meeting) => meeting.folders.map((folder) => folder.id))
        .filter(Boolean),
    ).size;
  const transcriptReadyCount = () =>
    weekMeetings().filter((meeting) => meeting.transcriptLoaded).length;
  const busiestDay = () =>
    weekActivity().reduce(
      (current, candidate) => (candidate.count > current ? candidate.count : current),
      0,
    );
  const indexedMeetings = () =>
    props.appState?.index.loaded
      ? props.appState.index.meetingCount
      : props.appState?.documents.loaded
        ? props.appState.documents.count
        : 0;

  return (
    <section class="home-dashboard">
      <div class="home-dashboard__hero">
        <div>
          <p class="home-dashboard__eyebrow">Home</p>
          <h2>Start from a folder, recent meeting, or review queue.</h2>
          <p>
            Granola Toolkit works best when it feels like a calm inbox for today’s work, not a raw
            dump of every meeting you have ever had.
          </p>
        </div>
        <div class="home-dashboard__summary">
          <div class="home-dashboard__summary-label">Local runtime</div>
          <strong>{runtimeLabel(props.serverInfo)}</strong>
          <span>{syncStatus()}</span>
        </div>
      </div>
      <div class="home-dashboard__stats">
        <article class="dashboard-stat">
          <span class="dashboard-stat__label">Today</span>
          <strong>{String(todayMeetings().length)} meetings</strong>
          <span>
            {todayMeetings().length > 0
              ? `${todayMeetings().filter((meeting) => meeting.transcriptLoaded).length} with transcript ready.`
              : "No meeting activity yet today."}
          </span>
        </article>
        <article class="dashboard-stat">
          <span class="dashboard-stat__label">Last 7 days</span>
          <strong>{String(weekMeetings().length)} meetings</strong>
          <span>{`${activeFolderCount()} folders touched, ${transcriptReadyCount()} transcript-ready.`}</span>
        </article>
        <article class="dashboard-stat">
          <span class="dashboard-stat__label">Last 30 days</span>
          <strong>{String(monthMeetings().length)} meetings</strong>
          <span>
            {indexedMeetings() > 0
              ? `${String(indexedMeetings())} indexed locally overall.`
              : "Run sync to warm the local meeting index."}
          </span>
        </article>
        <article class="dashboard-stat">
          <span class="dashboard-stat__label">Review queue</span>
          <strong>{reviewSummaryLabel(props.reviewSummary)}</strong>
          <span>
            {props.reviewSummary.total > 0
              ? `${props.reviewSummary.issues} issues, ${props.reviewSummary.artefacts} artefacts, ${props.reviewSummary.runs} approvals.`
              : "Nothing needs approval right now."}
          </span>
        </article>
      </div>
      <section class="detail-section">
        <div class="section-head">
          <div>
            <h2>Latest meetings</h2>
            <p>Jump back into the most recent meetings without browsing a long list.</p>
          </div>
        </div>
        <Show
          when={latestMeetings().length > 0}
          fallback={
            <div class="empty empty--inline">
              Recent meetings will appear here after your first successful sync.
            </div>
          }
        >
          <div class="latest-meetings-grid">
            <For each={latestMeetings()}>
              {(meeting) => (
                <button
                  class="latest-meeting-card"
                  onClick={() => {
                    props.onOpenLatestMeeting(meeting);
                  }}
                  type="button"
                >
                  <span class="latest-meeting-card__date">
                    {relativeDateLabel(meeting.updatedAt)}
                  </span>
                  <strong class="latest-meeting-card__title">{meeting.title || meeting.id}</strong>
                  <span class="latest-meeting-card__meta">{latestFolderNames(meeting)}</span>
                  <span class="latest-meeting-card__meta">
                    {meeting.transcriptLoaded
                      ? `${meeting.transcriptSegmentCount} transcript segments`
                      : "Transcript still loading"}
                  </span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </section>
      <section class="detail-section home-activity">
        <div class="section-head">
          <div>
            <h2>Usage snapshot</h2>
            <p>Recent meeting activity in your local workspace.</p>
          </div>
          <div class="home-activity__meta">{syncStatus()}</div>
        </div>
        <div class="usage-snapshot-grid">
          <article class="snapshot-card">
            <span class="dashboard-stat__label">Connection</span>
            <strong>{authStatus()}</strong>
            <span>API key first, desktop session fallback.</span>
          </article>
          <article class="snapshot-card">
            <span class="dashboard-stat__label">Sync</span>
            <strong>{health().title}</strong>
            <span>{health().detail}</span>
          </article>
          <article class="snapshot-card">
            <span class="dashboard-stat__label">Most active day</span>
            <strong>
              {busiestDay() > 0
                ? `${weekActivity().find((day) => day.count === busiestDay())?.label || "This week"}`
                : "No activity yet"}
            </strong>
            <span>
              {busiestDay() > 0
                ? `${busiestDay()} meetings on the busiest day.`
                : "Waiting for meetings to land."}
            </span>
          </article>
          <article class="snapshot-card">
            <span class="dashboard-stat__label">Folders available</span>
            <strong>{String(props.folders.length)}</strong>
            <span>
              {props.folders.length > 0
                ? "Use folders as the default browse path."
                : "Folders will show up after Granola exposes them."}
            </span>
          </article>
        </div>
        <div class="activity-chart">
          <div class="activity-chart__head">
            <span class="dashboard-stat__label">Last 7 days</span>
            <strong>{`${weekMeetings().length} meetings`}</strong>
          </div>
          <div class="activity-chart__bars" aria-label="Meetings in the last 7 days">
            <For each={weekActivity()}>
              {(day) => (
                <div class="activity-chart__bar-group">
                  <span class="activity-chart__value">{String(day.count)}</span>
                  <div
                    class="activity-chart__bar"
                    style={{
                      height: `${Math.max(12, busiestDay() > 0 ? (day.count / busiestDay()) * 160 : 12)}px`,
                    }}
                  />
                  <span class="activity-chart__label">{day.label}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </section>
      <div class="home-dashboard__grid">
        <section class="detail-section">
          <h2>Sync health</h2>
          <div class="health-card" data-tone={health().tone}>
            <strong>{health().title}</strong>
            <p>{health().detail}</p>
            <Show when={props.processingIssues.length > 0 || props.reviewSummary.total > 0}>
              <button
                class="button button--secondary"
                onClick={() => {
                  props.onOpenReview();
                }}
                type="button"
              >
                Open Review Inbox
              </button>
            </Show>
          </div>
        </section>
        <section class="detail-section">
          <h2>Folders</h2>
          <Show
            when={props.folders.length > 0}
            fallback={
              <div class="empty empty--inline">
                No folders are available yet. Run a sync or finish connecting your account first.
              </div>
            }
          >
            <div class="folder-list">
              <For each={props.folders.slice(0, 6)}>
                {(folder) => (
                  <button
                    class="folder-row"
                    onClick={() => {
                      props.onOpenFolder(folder.id);
                    }}
                    type="button"
                  >
                    <span class="folder-row__title">
                      {(folder.isFavourite ? "★ " : "") + (folder.name || folder.id)}
                    </span>
                    <span class="folder-row__meta">{`${folder.documentCount} meetings`}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>
        <section class="detail-section">
          <h2>Continue where you left off</h2>
          <Show
            when={props.recentMeetings.length > 0}
            fallback={
              <div class="empty empty--inline">
                Meetings you open will show up here so you can jump back in quickly.
              </div>
            }
          >
            <div class="folder-list">
              <For each={props.recentMeetings}>
                {(meeting) => (
                  <button
                    class="folder-row"
                    onClick={() => {
                      props.onOpenMeeting(meeting);
                    }}
                    type="button"
                  >
                    <span class="folder-row__title">{meeting.title}</span>
                    <span class="folder-row__meta">
                      {`${meeting.folderId ? "Scoped meeting" : "Recent meeting"} • ${formatDateLabel(
                        meeting.updatedAt,
                      )}`}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>
      </div>
    </section>
  );
}

export function BrowsePromptPanel(props: {
  foldersAvailable: number;
  hasRecentMeetings: boolean;
}): JSX.Element {
  return (
    <section class="browse-prompt">
      <h2>Choose one clear path</h2>
      <p>
        Pick a folder, open a recent meeting from Home, or switch to Search. The meeting list only
        shows up after you intentionally narrow it down.
      </p>
      <Show when={props.foldersAvailable === 0 && !props.hasRecentMeetings}>
        <p class="browse-prompt__hint">
          Once you have synced at least once, folders and recent meetings will show up here.
        </p>
      </Show>
    </section>
  );
}

export function FolderList(props: FolderListProps): JSX.Element {
  return (
    <section class="folder-panel">
      <div class="folder-panel__head">
        <h2>Folders</h2>
        <p>Use folders as the default way to narrow the workspace before opening meetings.</p>
      </div>
      <div class="folder-list">
        <Show
          when={!props.error}
          fallback={<div class="folder-empty folder-empty--error">{props.error}</div>}
        >
          <>
            <For each={props.folders}>
              {(folder) => (
                <button
                  class="folder-row"
                  data-selected={folder.id === props.selectedFolderId ? "true" : undefined}
                  onClick={() => {
                    props.onSelect(folder.id);
                  }}
                  type="button"
                >
                  <span class="folder-row__title">
                    {(folder.isFavourite ? "★ " : "") + (folder.name || folder.id)}
                  </span>
                  <span class="folder-row__meta">{`${folder.documentCount} meetings`}</span>
                </button>
              )}
            </For>
            <Show when={props.folders.length === 0}>
              <div class="folder-empty">No folders found.</div>
            </Show>
          </>
        </Show>
      </div>
    </section>
  );
}

export function SavedFiltersPanel(props: SavedFiltersPanelProps): JSX.Element {
  const canSaveCurrent = () =>
    hasActiveFilters({
      search: props.search,
      selectedFolderId: props.selectedFolderId,
      sort: props.sort,
      updatedFrom: props.updatedFrom,
      updatedTo: props.updatedTo,
    });

  return (
    <section class="folder-panel">
      <div class="folder-panel__head">
        <h2>Saved Filters</h2>
        <p>Keep the slices you revisit often close at hand.</p>
      </div>
      <div class="saved-filter-actions">
        <button
          class="button button--secondary"
          disabled={!canSaveCurrent()}
          onClick={() => {
            props.onSaveCurrent();
          }}
          type="button"
        >
          Save current filter
        </button>
      </div>
      <div class="saved-filter-list">
        <Show
          when={props.savedFilters.length > 0}
          fallback={<div class="folder-empty">No saved filters yet.</div>}
        >
          <For each={props.savedFilters}>
            {(preset) => (
              <div class="saved-filter-card">
                <button
                  class="saved-filter-card__main"
                  onClick={() => {
                    props.onApply(preset);
                  }}
                  type="button"
                >
                  <span class="folder-row__title">{preset.label}</span>
                  <span class="folder-row__meta">
                    {currentFilterSummary({
                      folders: props.folders,
                      ...preset.filters,
                    }) || "Saved workspace scope"}
                  </span>
                </button>
                <button
                  class="saved-filter-card__remove"
                  onClick={() => {
                    props.onRemove(preset.id);
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function RecentMeetingsPanel(props: RecentMeetingsPanelProps): JSX.Element {
  return (
    <section class="folder-panel">
      <div class="folder-panel__head">
        <h2>Recent Meetings</h2>
        <p>Jump back into the conversations you opened most recently.</p>
      </div>
      <div class="folder-list">
        <Show
          when={props.recentMeetings.length > 0}
          fallback={<div class="folder-empty">No recent meetings yet.</div>}
        >
          <For each={props.recentMeetings}>
            {(meeting) => (
              <button
                class="folder-row"
                onClick={() => {
                  props.onOpen(meeting);
                }}
                type="button"
              >
                <span class="folder-row__title">{meeting.title}</span>
                <span class="folder-row__meta">{meeting.updatedAt.slice(0, 10)}</span>
              </button>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function MeetingList(props: MeetingListProps): JSX.Element {
  const summary = () =>
    currentFilterSummary({
      folders: props.folders,
      search: props.search,
      selectedFolderId: props.selectedFolderId,
      updatedFrom: props.updatedFrom,
      updatedTo: props.updatedTo,
    });

  return (
    <section class="meeting-list">
      <div class="meeting-list__head">
        <h2>{props.heading || "Meetings"}</h2>
        <p>
          {props.description ||
            (summary() ? `Browsing ${summary()}.` : "Choose a meeting from this focused list.")}
        </p>
      </div>
      <Show
        when={!props.error}
        fallback={<div class="meeting-empty meeting-empty--error">{props.error}</div>}
      >
        <Show
          fallback={
            <div class="meeting-empty">
              {summary()
                ? `No meetings match ${summary()}.`
                : props.emptyHint || "No meetings yet. Try Sync now."}
            </div>
          }
          when={props.meetings.length > 0}
        >
          <For each={props.meetings}>
            {(meeting) => (
              <button
                class="meeting-row"
                data-selected={meeting.id === props.selectedMeetingId ? "true" : undefined}
                onClick={() => {
                  props.onSelect(meeting.id);
                }}
                type="button"
              >
                <span class="meeting-row__title">{meeting.title || meeting.id}</span>
                <span class="meeting-row__meta">
                  {meeting.tags.length
                    ? meeting.tags.map((tag) => `#${tag}`).join(" ")
                    : "untagged"}
                </span>
                <span class="meeting-row__meta">
                  {meeting.updatedAt ? meeting.updatedAt.slice(0, 10) : "unknown"}
                </span>
              </button>
            )}
          </For>
        </Show>
      </Show>
    </section>
  );
}

export function AppStatePanel(props: {
  appState?: GranolaAppState | null;
  heading: string;
  reviewSummary: GranolaReviewInboxSummary;
  serverInfo?: GranolaServerInfo | null;
  statusLabel: string;
  statusTone: WebStatusTone;
}): JSX.Element {
  const syncStatus = () => describeSyncStatus(props.appState?.sync ?? {});
  const authStatus = () => describeAuthStatus(props.appState?.auth);
  const indexedMeetings = () =>
    props.appState?.index.loaded
      ? props.appState.index.meetingCount
      : props.appState?.documents.loaded
        ? props.appState.documents.count
        : 0;

  return (
    <section class="detail-head">
      <div>
        <h2>{props.heading}</h2>
        <p class="detail-head__copy">
          The browser is attached to your local Granola service, so sync, review, and exports stay
          in step with the CLI and TUI.
        </p>
        <Show fallback={<p>Waiting for server state…</p>} when={props.appState}>
          {(appState) => (
            <div class="status-grid">
              <div>
                <span class="status-label">Connection</span>
                <strong>{authStatus()}</strong>
              </div>
              <div>
                <span class="status-label">Sync</span>
                <strong>{syncStatus()}</strong>
              </div>
              <div>
                <span class="status-label">Meetings indexed</span>
                <strong>{String(indexedMeetings())}</strong>
              </div>
              <div>
                <span class="status-label">Folders</span>
                <strong>
                  {appState().folders.loaded ? String(appState().folders.count) : "Not loaded yet"}
                </strong>
              </div>
              <div>
                <span class="status-label">Needs review</span>
                <strong>{reviewSummaryLabel(props.reviewSummary)}</strong>
              </div>
              <div>
                <span class="status-label">Runtime</span>
                <strong>{runtimeLabel(props.serverInfo)}</strong>
              </div>
            </div>
          )}
        </Show>
        <Show when={props.appState?.auth.lastError}>
          <p>{props.appState?.auth.lastError}</p>
        </Show>
      </div>
      <div class="state-badge" data-tone={props.statusTone}>
        {props.statusLabel}
      </div>
    </section>
  );
}

export function AdvancedSearchPanel(props: {
  onClose: () => void;
  onOpen: () => void;
  onQueryChange: (value: string) => void;
  query: string;
}): JSX.Element {
  return (
    <section class="advanced-search-panel">
      <div class="advanced-search-panel__head">
        <div>
          <h3>Advanced Search</h3>
          <p>
            Use this for an exact meeting title or a raw Granola meeting id. It stays out of the
            main sidebar on purpose.
          </p>
        </div>
        <button class="button button--secondary" onClick={props.onClose} type="button">
          Close
        </button>
      </div>
      <div class="advanced-search-panel__body">
        <input
          class="field-input"
          onInput={(event) => {
            props.onQueryChange(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              props.onOpen();
            }
          }}
          placeholder="Exact title or meeting id"
          value={props.query}
        />
        <button class="button button--primary" onClick={props.onOpen} type="button">
          Open Meeting
        </button>
      </div>
    </section>
  );
}

export function DiagnosticsPanel(props: {
  appState?: GranolaAppState | null;
  serverInfo?: GranolaServerInfo | null;
  statusLabel: string;
}): JSX.Element {
  const sync = () => props.appState?.sync;
  const auth = () => props.appState?.auth;

  return (
    <section class="jobs-panel diagnostics-panel">
      <div class="jobs-panel__head">
        <h3>Diagnostics</h3>
        <p>
          Runtime and storage details live here so the main workspace can stay user-facing while
          still giving power users a place to inspect internals.
        </p>
      </div>
      <div class="diagnostics-grid">
        <section class="detail-section">
          <h2>Runtime</h2>
          <div class="status-grid">
            <div>
              <span class="status-label">Status badge</span>
              <strong>{props.statusLabel}</strong>
            </div>
            <div>
              <span class="status-label">Transport</span>
              <strong>{props.serverInfo?.transport || "unknown"}</strong>
            </div>
            <div>
              <span class="status-label">Runtime mode</span>
              <strong>{props.serverInfo?.runtime.mode || "unknown"}</strong>
            </div>
            <div>
              <span class="status-label">Protocol</span>
              <strong>{String(props.serverInfo?.protocolVersion ?? "unknown")}</strong>
            </div>
          </div>
        </section>
        <section class="detail-section">
          <h2>Storage and sync</h2>
          <div class="status-grid">
            <div>
              <span class="status-label">Session store</span>
              <strong>{props.serverInfo?.persistence.sessionStore || "unknown"}</strong>
            </div>
            <div>
              <span class="status-label">Meeting index</span>
              <strong>
                {props.appState?.index.loaded
                  ? `${props.appState.index.meetingCount} meetings`
                  : props.appState?.index.available
                    ? "available"
                    : "not available"}
              </strong>
            </div>
            <div>
              <span class="status-label">Transcript cache</span>
              <strong>
                {props.appState?.cache.loaded
                  ? `${props.appState.cache.transcriptCount} transcript sets`
                  : props.appState?.cache.configured
                    ? "configured"
                    : "not configured"}
              </strong>
            </div>
            <div>
              <span class="status-label">Last sync run</span>
              <strong>{sync()?.lastCompletedAt?.slice(0, 19) || "never"}</strong>
            </div>
          </div>
        </section>
        <section class="detail-section">
          <h2>Auth internals</h2>
          <div class="status-grid">
            <div>
              <span class="status-label">Mode</span>
              <strong>{auth()?.mode || "unknown"}</strong>
            </div>
            <div>
              <span class="status-label">API key</span>
              <strong>{auth()?.apiKeyAvailable ? "available" : "missing"}</strong>
            </div>
            <div>
              <span class="status-label">Stored session</span>
              <strong>{auth()?.storedSessionAvailable ? "available" : "missing"}</strong>
            </div>
            <div>
              <span class="status-label">supabase.json</span>
              <strong>{auth()?.supabaseAvailable ? "available" : "missing"}</strong>
            </div>
          </div>
          <Show when={auth()?.lastError}>
            <p class="auth-card__meta auth-card__error">{auth()?.lastError}</p>
          </Show>
        </section>
      </div>
    </section>
  );
}

export function SecurityPanel(props: SecurityPanelProps): JSX.Element {
  return (
    <Show when={props.visible}>
      <section class="security-panel">
        <div class="security-panel__head">
          <h3>Server Access</h3>
          <p>This server is locked with a password. Unlock it to load meetings and live state.</p>
        </div>
        <div class="security-panel__body">
          <input
            class="field-input"
            onInput={(event) => {
              props.onPasswordChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onUnlock();
              }
            }}
            placeholder="Server password"
            type="password"
            value={props.password}
          />
          <div class="toolbar-actions">
            <button class="button button--primary" onClick={props.onUnlock} type="button">
              Unlock
            </button>
            <button class="button button--secondary" onClick={props.onLock} type="button">
              Lock
            </button>
          </div>
        </div>
      </section>
    </Show>
  );
}

export function AuthPanel(props: AuthPanelProps): JSX.Element {
  return (
    <section class="auth-panel">
      <div class="auth-panel__head">
        <h3>Auth Session</h3>
        <p>
          Prefer a Granola Personal API key, then keep stored session and <code>supabase.json</code>{" "}
          as fallbacks.
        </p>
      </div>
      <div class="auth-panel__body">
        <Show
          fallback={
            <div class="auth-card">
              <div class="auth-card__meta">Auth state unavailable.</div>
            </div>
          }
          when={props.auth}
        >
          {(auth) => (
            <div class="auth-card">
              <div class="status-grid">
                <div>
                  <span class="status-label">Active</span>
                  <strong>{granolaAuthModeLabel(auth().mode)}</strong>
                </div>
                <div>
                  <span class="status-label">API key</span>
                  <strong>{auth().apiKeyAvailable ? "available" : "missing"}</strong>
                </div>
                <div>
                  <span class="status-label">Stored</span>
                  <strong>{auth().storedSessionAvailable ? "available" : "missing"}</strong>
                </div>
                <div>
                  <span class="status-label">supabase.json</span>
                  <strong>{auth().supabaseAvailable ? "available" : "missing"}</strong>
                </div>
                <div>
                  <span class="status-label">Refresh</span>
                  <strong>{auth().refreshAvailable ? "available" : "missing"}</strong>
                </div>
              </div>
              <div class="auth-card__meta">
                <strong>{granolaAuthRecommendation(auth()).status}.</strong>{" "}
                {granolaAuthRecommendation(auth()).detail}
              </div>
              <Show when={granolaAuthRecommendation(auth()).nextAction}>
                {(nextAction) => <div class="auth-card__meta">Next step: {nextAction()}</div>}
              </Show>
              <Show when={auth().clientId}>
                <div class="auth-card__meta">Client ID: {auth().clientId}</div>
              </Show>
              <Show when={auth().signInMethod}>
                <div class="auth-card__meta">Sign-in method: {auth().signInMethod}</div>
              </Show>
              <Show when={auth().supabasePath}>
                <div class="auth-card__meta">supabase path: {auth().supabasePath}</div>
              </Show>
              <Show when={auth().lastError}>
                <div class="auth-card__meta auth-card__error">{auth().lastError}</div>
              </Show>
              <div class="auth-card__meta">
                Save a Personal API key here or use{" "}
                <code>granola auth login --api-key &lt;token&gt;</code>. Desktop-session import
                remains the fallback path.
              </div>
              <div class="auth-card__meta">
                <strong>{granolaAgentProviderLabel(props.preferredProvider)} setup:</strong>{" "}
                {providerSetupHint(props.preferredProvider)}
              </div>
              <div class="auth-card__actions">
                <input
                  class="input"
                  onInput={(event) => {
                    props.onApiKeyDraftChange(event.currentTarget.value);
                  }}
                  placeholder="grn_..."
                  type="password"
                  value={props.apiKeyDraft}
                />
                <button class="button button--secondary" onClick={props.onSaveApiKey} type="button">
                  Save API key
                </button>
                <button
                  class="button button--secondary"
                  disabled={!auth().apiKeyAvailable || auth().mode === "api-key"}
                  onClick={() => {
                    props.onSwitchMode("api-key");
                  }}
                  type="button"
                >
                  Use API key
                </button>
                <button
                  class="button button--secondary"
                  disabled={!auth().supabaseAvailable}
                  onClick={props.onImportDesktopSession}
                  type="button"
                >
                  Import desktop session fallback
                </button>
                <button
                  class="button button--secondary"
                  disabled={!auth().storedSessionAvailable || !auth().refreshAvailable}
                  onClick={props.onRefresh}
                  type="button"
                >
                  Refresh stored session
                </button>
                <button
                  class="button button--secondary"
                  disabled={!auth().storedSessionAvailable || auth().mode === "stored-session"}
                  onClick={() => {
                    props.onSwitchMode("stored-session");
                  }}
                  type="button"
                >
                  Use stored session
                </button>
                <button
                  class="button button--secondary"
                  disabled={!auth().supabaseAvailable || auth().mode === "supabase-file"}
                  onClick={() => {
                    props.onSwitchMode("supabase-file");
                  }}
                  type="button"
                >
                  Use supabase.json
                </button>
                <button
                  class="button button--secondary"
                  disabled={!auth().apiKeyAvailable && !auth().storedSessionAvailable}
                  onClick={props.onLogout}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </section>
  );
}

export function ExportJobsPanel(props: ExportJobsPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Recent Export Jobs</h3>
        <p>Tracked across CLI and web runs.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.jobs.length > 0}
          fallback={<div class="job-empty">No export jobs yet.</div>}
        >
          <For each={props.jobs.slice(0, 6)}>
            {(job) => (
              <article class="job-card">
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{job.kind} export</div>
                    <div class="job-card__meta">{job.id}</div>
                  </div>
                  <div class="job-card__status" data-status={job.status}>
                    {job.status}
                  </div>
                </div>
                <div class="job-card__meta">
                  {`Format: ${job.format} • ${scopeLabel(job.scope)} • ${
                    job.itemCount > 0 ? `${job.completedCount}/${job.itemCount} items` : "0 items"
                  } • Written: ${job.written}`}
                </div>
                <div class="job-card__meta">Started: {job.startedAt.slice(0, 19)}</div>
                <div class="job-card__meta">Output: {job.outputDir}</div>
                <Show when={job.error}>
                  <div class="job-card__meta">{job.error}</div>
                </Show>
                <div class="job-card__actions">
                  <Show when={job.status !== "running"}>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onRerun(job.id);
                      }}
                      type="button"
                    >
                      Rerun
                    </button>
                  </Show>
                </div>
              </article>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function AutomationRunsPanel(props: AutomationRunsPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Automation Runs</h3>
        <p>Recent action runs triggered by durable sync events.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.runs.length > 0}
          fallback={<div class="job-empty">No automation runs yet.</div>}
        >
          <For each={props.runs.slice(0, 6)}>
            {(run) => (
              <article class="job-card">
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{run.actionName}</div>
                    <div class="job-card__meta">{`${run.ruleName} • ${run.id}`}</div>
                  </div>
                  <div class="job-card__status" data-status={run.status}>
                    {run.status}
                  </div>
                </div>
                <div class="job-card__meta">{`${run.title} • ${run.eventKind}`}</div>
                <div class="job-card__meta">{`Started: ${run.startedAt.slice(0, 19)}`}</div>
                <Show when={run.prompt}>
                  <div class="job-card__meta">{run.prompt}</div>
                </Show>
                <Show when={run.result}>
                  <div class="job-card__meta">{run.result}</div>
                </Show>
                <Show when={run.error}>
                  <div class="job-card__meta">{run.error}</div>
                </Show>
                <div class="job-card__actions">
                  <Show when={run.status === "pending"}>
                    <>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          props.onApprove(run.id);
                        }}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          props.onReject(run.id);
                        }}
                        type="button"
                      >
                        Reject
                      </button>
                    </>
                  </Show>
                </div>
              </article>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function ProcessingIssuesPanel(props: ProcessingIssuesPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Processing Health</h3>
        <p>Catch stale syncs, missing transcripts, and failed or outdated note pipelines.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.issues.length > 0}
          fallback={<div class="job-empty">No processing issues detected.</div>}
        >
          <For each={props.issues.slice(0, 8)}>
            {(issue) => (
              <article class="job-card">
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{issue.title}</div>
                    <div class="job-card__meta">{issue.id}</div>
                  </div>
                  <div class="job-card__status" data-status={issue.severity}>
                    {issue.severity}
                  </div>
                </div>
                <div class="job-card__meta">{issue.kind}</div>
                <div class="job-card__meta">{issue.detail}</div>
                <div class="job-card__actions">
                  <Show when={issue.meetingId}>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onOpenMeeting(issue.meetingId!);
                      }}
                      type="button"
                    >
                      Open Meeting
                    </button>
                  </Show>
                  <Show when={issue.recoverable}>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onRecover(issue.id);
                      }}
                      type="button"
                    >
                      Recover
                    </button>
                  </Show>
                </div>
              </article>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function ReviewInboxPanel(props: ReviewInboxPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Review Inbox</h3>
        <p>
          {props.summary.total > 0
            ? `${props.summary.total} items need attention: ${props.summary.issues} issues, ${props.summary.artefacts} artefacts, ${props.summary.runs} approvals.`
            : "Nothing needs attention right now."}
        </p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.items.length > 0}
          fallback={<div class="job-empty">No review items waiting.</div>}
        >
          <For each={props.items.slice(0, 12)}>
            {(item) => (
              <button
                class="job-card job-card--button"
                data-selected={item.key === props.selectedKey ? "true" : undefined}
                onClick={() => {
                  props.onSelect(item.key);
                }}
                type="button"
              >
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{item.title}</div>
                    <div class="job-card__meta">{item.subtitle}</div>
                  </div>
                  <div class="job-card__status" data-status={item.status}>
                    {item.status}
                  </div>
                </div>
                <Show when={item.meetingId}>
                  <div class="job-card__meta">{item.meetingId}</div>
                </Show>
                <div class="job-card__meta">{item.summary}</div>
                <div class="job-card__meta">{`Updated: ${item.timestamp.slice(0, 19)}`}</div>
              </button>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function AutomationArtefactsPanel(props: AutomationArtefactsPanelProps): JSX.Element {
  return (
    <section class="jobs-panel">
      <div class="jobs-panel__head">
        <h3>Review Queue</h3>
        <p>Generated note and enrichment candidates waiting for review or follow-up.</p>
      </div>
      <div class="jobs-list">
        <Show
          when={props.artefacts.length > 0}
          fallback={<div class="job-empty">No automation artefacts yet.</div>}
        >
          <For each={props.artefacts.slice(0, 10)}>
            {(artefact) => (
              <button
                class="job-card job-card--button"
                data-selected={artefact.id === props.selectedArtefactId ? "true" : undefined}
                onClick={() => {
                  props.onSelect(artefact.id);
                }}
                type="button"
              >
                <div class="job-card__head">
                  <div>
                    <div class="job-card__title">{artefact.structured.title}</div>
                    <div class="job-card__meta">{`${artefact.kind} • ${artefact.ruleName}`}</div>
                  </div>
                  <div class="job-card__status" data-status={artefact.status}>
                    {artefact.status}
                  </div>
                </div>
                <div class="job-card__meta">{artefact.meetingId}</div>
                <Show when={artefact.structured.summary}>
                  <div class="job-card__meta">{artefact.structured.summary}</div>
                </Show>
                <div class="job-card__meta">{`Updated: ${artefact.updatedAt.slice(0, 19)}`}</div>
              </button>
            )}
          </For>
        </Show>
      </div>
    </section>
  );
}

export function IssueReviewPanel(props: {
  issue: import("../app/index.ts").GranolaProcessingIssue | null;
  onOpenMeeting: (meetingId: string) => void;
  onRecover: (id: string) => void;
}): JSX.Element {
  return (
    <section class="review-panel">
      <div class="jobs-panel__head">
        <h3>Issue Review</h3>
        <p>Inspect the issue, jump to the meeting if needed, and run recovery from one place.</p>
      </div>
      <Show
        when={props.issue}
        fallback={<div class="job-empty">Select a processing issue to inspect it.</div>}
      >
        {(issue) => (
          <div class="review-body">
            <div class="detail-meta">
              <div class="detail-chip">{`Severity: ${issue().severity}`}</div>
              <div class="detail-chip">{`Kind: ${issue().kind}`}</div>
              <Show when={issue().meetingId}>
                <div class="detail-chip">{`Meeting: ${issue().meetingId}`}</div>
              </Show>
            </div>
            <section class="detail-section">
              <h2>{issue().title}</h2>
              <p>{issue().detail}</p>
              <div class="job-card__actions">
                <Show when={issue().meetingId}>
                  <button
                    class="button button--secondary"
                    onClick={() => {
                      props.onOpenMeeting(issue().meetingId!);
                    }}
                    type="button"
                  >
                    Open meeting
                  </button>
                </Show>
                <Show when={issue().recoverable}>
                  <button
                    class="button button--secondary"
                    onClick={() => {
                      props.onRecover(issue().id);
                    }}
                    type="button"
                  >
                    Recover
                  </button>
                </Show>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  );
}

export function RunReviewPanel(props: {
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  run: GranolaAutomationActionRun | null;
}): JSX.Element {
  return (
    <section class="review-panel">
      <div class="jobs-panel__head">
        <h3>Approval Review</h3>
        <p>Approve or reject ask-user automation runs with the meeting context still in view.</p>
      </div>
      <Show
        when={props.run}
        fallback={<div class="job-empty">Select a pending run to review it.</div>}
      >
        {(run) => (
          <div class="review-body">
            <div class="detail-meta">
              <div class="detail-chip">{`Status: ${run().status}`}</div>
              <div class="detail-chip">{`Action: ${run().actionName}`}</div>
              <div class="detail-chip">{`Rule: ${run().ruleName}`}</div>
              <div class="detail-chip">{`Meeting: ${run().meetingId}`}</div>
            </div>
            <section class="detail-section">
              <h2>{run().title}</h2>
              <p>{run().prompt || run().result || run().error || run().eventKind}</p>
              <div class="job-card__actions">
                <button
                  class="button button--secondary"
                  onClick={() => {
                    props.onOpenMeeting(run().meetingId);
                  }}
                  type="button"
                >
                  Open meeting
                </button>
                <Show when={run().status === "pending"}>
                  <>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onApprove(run().id);
                      }}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        props.onReject(run().id);
                      }}
                      type="button"
                    >
                      Reject
                    </button>
                  </>
                </Show>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  );
}

export function ArtefactReviewPanel(props: ArtefactReviewPanelProps): JSX.Element {
  return (
    <section class="review-panel">
      <div class="jobs-panel__head">
        <h3>Artefact Review</h3>
        <p>
          Review generated candidate notes, compare them to the current meeting, then approve,
          reject, edit, or rerun.
        </p>
      </div>
      <Show
        when={props.artefact}
        fallback={
          <div class="job-empty">
            {props.error || "Select an automation artefact to review it."}
          </div>
        }
      >
        {(artefact) => (
          <div class="review-body">
            <div class="detail-meta">
              <div class="detail-chip">{`Status: ${artefact().status}`}</div>
              <div class="detail-chip">{`Kind: ${artefact().kind}`}</div>
              <div class="detail-chip">{`Meeting: ${artefact().meetingId}`}</div>
              <div class="detail-chip">{`Provider: ${artefact().provider}/${artefact().model}`}</div>
            </div>
            <Show when={!props.error} fallback={<div class="empty">{props.error}</div>}>
              <div class="review-grid">
                <section class="detail-section">
                  <h2>Current Meeting Notes</h2>
                  <pre class="detail-pre">
                    {props.bundle?.meeting.noteMarkdown || "(No existing meeting notes)"}
                  </pre>
                </section>
                <section class="detail-section">
                  <h2>Candidate</h2>
                  <label class="field-row">
                    <span class="field-label">Title</span>
                    <input
                      class="field-input field-input--plain"
                      onInput={(event) => {
                        props.onDraftTitleChange(event.currentTarget.value);
                      }}
                      value={props.draftTitle}
                    />
                  </label>
                  <label class="field-row">
                    <span class="field-label">Summary</span>
                    <textarea
                      class="review-textarea review-textarea--summary"
                      onInput={(event) => {
                        props.onDraftSummaryChange(event.currentTarget.value);
                      }}
                    >
                      {props.draftSummary}
                    </textarea>
                  </label>
                  <label class="field-row">
                    <span class="field-label">Markdown</span>
                    <textarea
                      class="review-textarea"
                      onInput={(event) => {
                        props.onDraftMarkdownChange(event.currentTarget.value);
                      }}
                    >
                      {props.draftMarkdown}
                    </textarea>
                  </label>
                  <label class="field-row">
                    <span class="field-label">Review Note</span>
                    <textarea
                      class="review-textarea review-textarea--summary"
                      onInput={(event) => {
                        props.onReviewNoteChange(event.currentTarget.value);
                      }}
                    >
                      {props.reviewNote}
                    </textarea>
                  </label>
                  <div class="job-card__actions">
                    <button class="button button--secondary" onClick={props.onSave} type="button">
                      Save edits
                    </button>
                    <button
                      class="button button--secondary"
                      disabled={artefact().status === "superseded"}
                      onClick={props.onApprove}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      class="button button--secondary"
                      disabled={artefact().status === "superseded"}
                      onClick={props.onReject}
                      type="button"
                    >
                      Reject
                    </button>
                    <button class="button button--secondary" onClick={props.onRerun} type="button">
                      Rerun
                    </button>
                  </div>
                  <Show when={artefact().structured.actionItems.length > 0}>
                    <div class="detail-section">
                      <h3>Action Items</h3>
                      <ul class="detail-list">
                        <For each={artefact().structured.actionItems}>
                          {(item) => (
                            <li>
                              <strong>{item.title}</strong>
                              <Show when={item.owner}>
                                <span>{` • ${item.owner}`}</span>
                              </Show>
                              <Show when={item.dueDate}>
                                <span>{` • due ${item.dueDate}`}</span>
                              </Show>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                  <Show when={(artefact().structured.participantSummaries?.length ?? 0) > 0}>
                    <div class="detail-section">
                      <h3>Participant Summaries</h3>
                      <ul class="detail-list">
                        <For each={artefact().structured.participantSummaries}>
                          {(summary) => (
                            <li>
                              <strong>{summary.speaker}</strong>
                              <Show when={summary.role}>
                                <span>{` • ${summary.role}`}</span>
                              </Show>
                              <div>{summary.summary}</div>
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                </section>
              </div>
            </Show>
            <section class="detail-section review-history">
              <h2>History</h2>
              <div class="jobs-list">
                <For each={artefact().history.slice().reverse()}>
                  {(entry) => (
                    <div class="job-card">
                      <div class="job-card__head">
                        <div class="job-card__title">{entry.action}</div>
                        <div class="job-card__meta">{entry.at.slice(0, 19)}</div>
                      </div>
                      <Show when={entry.note}>
                        <div class="job-card__meta">{entry.note}</div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </section>
          </div>
        )}
      </Show>
    </section>
  );
}

export function Workspace(props: WorkspaceProps): JSX.Element {
  const parsedTab = () => parseWorkspaceTab(props.tab);
  const details = () => {
    if (!props.selectedMeeting) {
      return null;
    }

    return workspaceBody(props.bundle, props.selectedMeeting, parsedTab());
  };

  return (
    <Show
      when={props.selectedMeeting}
      fallback={
        <div class="empty">
          {props.detailError ||
            "Choose a folder, recent meeting, or search result to open it here."}
        </div>
      }
    >
      {(meeting) => (
        <>
          <div class="detail-meta">
            <div class="detail-chip">{`Updated ${formatDateLabel(meeting().meeting.updatedAt)}`}</div>
            <div class="detail-chip">{`Folders: ${formatFolderNames(meeting().meeting.folders)}`}</div>
            <div class="detail-chip">{`Notes: ${meeting().meeting.noteContentSource}`}</div>
            <div class="detail-chip">
              {meeting().meeting.transcriptLoaded
                ? `${meeting().meeting.transcriptSegmentCount} transcript segments`
                : "Transcript not loaded yet"}
            </div>
            <Show when={meeting().meeting.tags.length > 0}>
              <For each={meeting().meeting.tags}>
                {(tag) => <div class="detail-chip">{`#${tag}`}</div>}
              </For>
            </Show>
          </div>
          <nav class="workspace-tabs">
            <For each={["notes", "transcript", "metadata", "raw"] as const}>
              {(tab) => (
                <button
                  class="workspace-tab"
                  data-selected={parsedTab() === tab ? "true" : undefined}
                  onClick={() => {
                    props.onSelectTab(tab);
                  }}
                  type="button"
                >
                  {tab === "notes"
                    ? "Notes"
                    : tab === "transcript"
                      ? "Transcript"
                      : tab === "metadata"
                        ? "Metadata"
                        : "Raw"}
                </button>
              )}
            </For>
            <span class="workspace-hint">1-4 switch tabs, [ and ] cycle</span>
          </nav>
          <Show when={!props.detailError} fallback={<div class="empty">{props.detailError}</div>}>
            <div class="detail-body">
              <section class="detail-section workspace-main workspace-main--single">
                <h2>{details()?.title}</h2>
                <pre class="detail-pre">{details()?.body}</pre>
              </section>
            </div>
          </Show>
        </>
      )}
    </Show>
  );
}
