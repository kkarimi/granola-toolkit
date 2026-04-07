/** @jsxImportSource solid-js */

import { For, Match, Show, Switch, type JSX } from "solid-js";

import type {
  FolderSummaryRecord,
  GranolaAppState,
  GranolaMeetingSort,
  GranolaProcessingIssue,
  MeetingSummaryRecord,
} from "../app/index.ts";
import type { GranolaReviewInboxSummary } from "../review-inbox.ts";
import type { GranolaServerInfo } from "../transport.ts";
import {
  currentFilterSummary,
  describeAuthStatus,
  describeSyncStatus,
  hasActiveFilters,
  type WebWorkspaceRecentMeeting,
  type WebWorkspaceSavedFilter,
} from "../web/client-state.ts";
import type { WebSettingsSection } from "./shared-components.tsx";

import {
  compactPathLabel,
  formatBytesLabel,
  formatDateTimeLabel,
  formatDateLabel,
  latestFolderNames,
  meetingsPerDay,
  meetingsWithinDays,
  pathLeafLabel,
  relativeDateLabel,
  relativeTimeLabel,
  resolveAsyncViewState,
  reviewSummaryLabel,
  runtimeLabel,
  syncCadenceLabel,
  syncHealthSummary,
} from "./component-helpers.ts";

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
  freshnessNote?: string;
  loading?: boolean;
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
  freshnessNote?: string;
  heading?: string;
  loading?: boolean;
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
  automationEnabled: boolean;
  folders: FolderSummaryRecord[];
  foldersLoading: boolean;
  onOpenFolder: (folderId: string) => void;
  onOpenLatestMeeting: (meeting: MeetingSummaryRecord) => void;
  onOpenMeeting: (meeting: WebWorkspaceRecentMeeting) => void;
  onOpenSettings: (tab: WebSettingsSection) => void;
  onOpenReview: () => void;
  latestMeetings: MeetingSummaryRecord[];
  latestMeetingsLoading: boolean;
  processingIssues: GranolaProcessingIssue[];
  recentMeetings: WebWorkspaceRecentMeeting[];
  reviewSummary: GranolaReviewInboxSummary;
  serverInfo?: GranolaServerInfo | null;
}

function CardActionButton(props: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      aria-label={props.label}
      class="card-icon-button"
      onClick={() => props.onClick()}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M10.4 2h3.2l.5 2.1c.5.2 1 .4 1.5.7l1.9-1.1 2.3 2.3-1.1 1.9c.3.5.5 1 .7 1.5L22 10.4v3.2l-2.1.5c-.2.5-.4 1-.7 1.5l1.1 1.9-2.3 2.3-1.9-1.1c-.5.3-1 .5-1.5.7L13.6 22h-3.2l-.5-2.1c-.5-.2-1-.4-1.5-.7l-1.9 1.1-2.3-2.3 1.1-1.9c-.3-.5-.5-1-.7-1.5L2 13.6v-3.2l2.1-.5c.2-.5.4-1 .7-1.5L3.7 6.5l2.3-2.3 1.9 1.1c.5-.3 1-.5 1.5-.7L10.4 2Zm1.6 6.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
      </svg>
    </button>
  );
}

function LoadingBlock(props: { label: string; lines?: number }): JSX.Element {
  return (
    <div aria-live="polite" class="loading-block" role="status">
      <span class="loading-block__label">{props.label}</span>
      <div class="loading-block__lines">
        <For each={Array.from({ length: props.lines ?? 3 })}>
          {() => <div class="loading-line" />}
        </For>
      </div>
    </div>
  );
}

function LoadingCardGrid(props: { label: string; count?: number }): JSX.Element {
  return (
    <div aria-live="polite" class="loading-card-grid" role="status">
      <span class="loading-block__label">{props.label}</span>
      <div class="loading-card-grid__items">
        <For each={Array.from({ length: props.count ?? 4 })}>
          {() => (
            <div class="loading-card">
              <div class="loading-line loading-line--short" />
              <div class="loading-line" />
              <div class="loading-line loading-line--medium" />
            </div>
          )}
        </For>
      </div>
    </div>
  );
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

export function SearchWorkspacePanel(props: SearchWorkspacePanelProps): JSX.Element {
  return (
    <section class="search-panel">
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
            <p>Use this only when you already know the exact title or Granola id.</p>
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
  const configLabel = () =>
    props.appState?.config.configFileUsed ? "Custom .granola.toml loaded" : "No custom config file";
  const configDetail = () =>
    props.appState?.config.configFileUsed
      ? `${pathLeafLabel(props.appState.config.configFileUsed)} · ${compactPathLabel(props.appState.config.configFileUsed)}`
      : "Using toolkit defaults. Change values from Auth, Plugins, and Exports, or add a .granola.toml later.";
  const transcriptLabel = () =>
    props.appState?.cache.loaded && props.appState.cache.transcriptCount > 0
      ? `${props.appState.cache.transcriptCount} transcript sets in desktop cache`
      : props.appState?.cache.loaded
        ? "Desktop transcript cache available"
        : props.appState?.cache.configured
          ? "Desktop transcript cache configured"
          : "Transcripts on demand";
  const transcriptDetail = () =>
    props.appState?.cache.loaded && props.appState.cache.transcriptCount > 0
      ? `${pathLeafLabel(props.appState.cache.filePath)} · loaded ${relativeTimeLabel(props.appState.cache.loadedAt)}`
      : props.appState?.cache.loaded
        ? `${pathLeafLabel(props.appState.cache.filePath)} · no transcript entries found in this cache file`
        : props.appState?.cache.filePath
          ? `${compactPathLabel(props.appState.cache.filePath)} · toolkit can warm transcripts from this cache`
          : "Meeting transcripts are fetched from Granola when you open them.";
  const localIndexLabel = () =>
    props.appState?.index.loaded
      ? `${props.appState.index.meetingCount} meetings in local index`
      : props.appState?.documents.loaded
        ? `${props.appState.documents.count} meetings loaded`
        : "Local index not warmed yet";
  const localIndexDetail = () =>
    props.appState?.index.filePath || props.serverInfo?.files?.meetingIndex?.path
      ? `${pathLeafLabel(props.appState?.index.filePath || props.serverInfo?.files?.meetingIndex?.path)} · ${formatBytesLabel(
          props.serverInfo?.files?.meetingIndex?.sizeBytes,
        )} · ${
          props.appState?.index.loadedAt
            ? `updated ${relativeTimeLabel(props.appState.index.loadedAt)}`
            : "index available locally"
        }`
      : "Toolkit will write a local meeting index after the first successful sync.";
  const authDetail = () => {
    const sources = [
      props.appState?.auth.apiKeyAvailable ? "API key" : null,
      props.appState?.auth.storedSessionAvailable ? "desktop session" : null,
      props.appState?.auth.supabaseAvailable ? "supabase.json" : null,
    ].filter(Boolean);
    return sources.length > 0
      ? `${sources.join(" · ")} available`
      : "No fallback auth sources detected yet.";
  };

  return (
    <section class="home-dashboard">
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
          <span class="dashboard-stat__label">Local runtime</span>
          <strong>{runtimeLabel(props.serverInfo)}</strong>
          <span>
            {indexedMeetings() > 0
              ? `${String(indexedMeetings())} indexed locally overall.`
              : "Run sync to warm the local meeting index."}
          </span>
        </article>
        <article class="dashboard-stat">
          <span class="dashboard-stat__label">
            {props.automationEnabled ? "Review queue" : "Automation plugin"}
          </span>
          <strong>
            {props.automationEnabled ? reviewSummaryLabel(props.reviewSummary) : "Disabled"}
          </strong>
          <span>
            {props.automationEnabled
              ? props.reviewSummary.total > 0
                ? `${props.reviewSummary.issues} issues, ${props.reviewSummary.artefacts} artefacts, ${props.reviewSummary.runs} approvals.`
                : "Nothing needs approval right now."
              : "Enable automation from Settings -> Plugins when you want agent workflows and review queues."}
          </span>
        </article>
      </div>
      <section class="detail-section">
        <div class="section-head">
          <div>
            <h2>Sync and local state</h2>
            <p>What the toolkit is showing locally, and where that state comes from.</p>
          </div>
        </div>
        <div class="usage-snapshot-grid">
          <article class="snapshot-card">
            <div class="snapshot-card__head">
              <span class="dashboard-stat__label">Sync</span>
              <CardActionButton
                label="Open diagnostics"
                onClick={() => props.onOpenSettings("diagnostics")}
              />
            </div>
            <strong>
              {props.appState?.sync.lastCompletedAt
                ? `Last synced ${relativeTimeLabel(props.appState.sync.lastCompletedAt)}`
                : describeSyncStatus(props.appState?.sync ?? {})}
            </strong>
            <span>
              {props.appState?.sync.lastCompletedAt
                ? `${formatDateTimeLabel(props.appState.sync.lastCompletedAt)} · ${syncCadenceLabel(props.serverInfo)}`
                : syncCadenceLabel(props.serverInfo)}
            </span>
          </article>
          <article class="snapshot-card">
            <div class="snapshot-card__head">
              <span class="dashboard-stat__label">Auth</span>
              <CardActionButton
                label="Open auth settings"
                onClick={() => props.onOpenSettings("auth")}
              />
            </div>
            <strong>{authStatus()}</strong>
            <span>{authDetail()}</span>
          </article>
          <article class="snapshot-card">
            <div class="snapshot-card__head">
              <span class="dashboard-stat__label">Local index</span>
              <CardActionButton
                label="Open diagnostics"
                onClick={() => props.onOpenSettings("diagnostics")}
              />
            </div>
            <strong>{localIndexLabel()}</strong>
            <span>{localIndexDetail()}</span>
          </article>
          <article class="snapshot-card">
            <div class="snapshot-card__head">
              <span class="dashboard-stat__label">Transcripts</span>
              <CardActionButton
                label="Open diagnostics"
                onClick={() => props.onOpenSettings("diagnostics")}
              />
            </div>
            <strong>{transcriptLabel()}</strong>
            <span>{transcriptDetail()}</span>
          </article>
          <article class="snapshot-card">
            <div class="snapshot-card__head">
              <span class="dashboard-stat__label">Config</span>
              <CardActionButton
                label="Open diagnostics"
                onClick={() => props.onOpenSettings("diagnostics")}
              />
            </div>
            <strong>{configLabel()}</strong>
            <span>{configDetail()}</span>
          </article>
        </div>
      </section>
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
            props.latestMeetingsLoading ? (
              <LoadingCardGrid count={4} label="Loading recent meetings…" />
            ) : (
              <div class="empty empty--inline">
                Recent meetings will appear here after your first successful sync.
              </div>
            )
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
              <Show when={props.automationEnabled}>
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
            </Show>
          </div>
        </section>
        <section class="detail-section">
          <h2>Folders</h2>
          <Show
            when={props.folders.length > 0}
            fallback={
              props.foldersLoading ? (
                <LoadingBlock label="Loading folders…" lines={4} />
              ) : (
                <div class="empty empty--inline">
                  No folders are available yet. Run sync or finish connecting your account first.
                </div>
              )
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
  const sortedFolders = () =>
    [...props.folders].sort((left, right) => {
      if (left.isFavourite !== right.isFavourite) {
        return left.isFavourite ? -1 : 1;
      }

      return (right.updatedAt || "").localeCompare(left.updatedAt || "");
    });
  const viewState = () =>
    resolveAsyncViewState({
      count: props.folders.length,
      error: props.error,
      loading: props.loading,
    });

  return (
    <section class="folder-directory">
      <div class="section-head">
        <div>
          <h2>Folder directory</h2>
          <p>Pick one part of your workspace first, then open one meeting from there.</p>
          <Show when={props.freshnessNote}>{(note) => <p class="section-note">{note()}</p>}</Show>
        </div>
      </div>
      <div class="folder-directory__grid">
        <Switch>
          <Match when={viewState() === "error"}>
            <div class="folder-empty folder-empty--error">{props.error}</div>
          </Match>
          <Match when={viewState() === "loading"}>
            <LoadingCardGrid count={6} label="Loading folder directory…" />
          </Match>
          <Match when={viewState() === "empty"}>
            <div class="empty empty--inline">
              No folders are available yet. Run sync once your account is connected and Granola has
              exposed folder data for this workspace.
            </div>
          </Match>
          <Match when={viewState() === "content"}>
            <For each={sortedFolders()}>
              {(folder) => (
                <button
                  class="folder-card"
                  data-selected={folder.id === props.selectedFolderId ? "true" : undefined}
                  onClick={() => {
                    props.onSelect(folder.id);
                  }}
                  type="button"
                >
                  <span class="folder-card__eyebrow">
                    {folder.isFavourite ? "Favourite folder" : "Folder"}
                  </span>
                  <strong class="folder-card__title">{folder.name || folder.id}</strong>
                  <span class="folder-card__meta">{`${folder.documentCount} meetings`}</span>
                  <span class="folder-card__meta">
                    {folder.updatedAt
                      ? `Updated ${relativeDateLabel(folder.updatedAt).toLowerCase()}`
                      : "Waiting for folder activity"}
                  </span>
                </button>
              )}
            </For>
          </Match>
        </Switch>
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
  const viewState = () =>
    resolveAsyncViewState({
      count: props.meetings.length,
      error: props.error,
      loading: props.loading,
    });

  return (
    <section class="meeting-list">
      <div class="meeting-list__head">
        <h2>{props.heading || "Meetings"}</h2>
        <p>
          {props.description ||
            (summary() ? `Browsing ${summary()}.` : "Choose a meeting from this focused list.")}
        </p>
        <Show when={props.freshnessNote}>{(note) => <p class="section-note">{note()}</p>}</Show>
      </div>
      <Switch>
        <Match when={viewState() === "error"}>
          <div class="meeting-empty meeting-empty--error">{props.error}</div>
        </Match>
        <Match when={viewState() === "loading"}>
          <LoadingBlock label="Loading meetings…" lines={5} />
        </Match>
        <Match when={viewState() === "empty"}>
          <div class="meeting-empty">
            {summary()
              ? `No meetings match ${summary()}.`
              : props.emptyHint || "No meetings yet. Try Sync now."}
          </div>
        </Match>
        <Match when={viewState() === "content"}>
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
        </Match>
      </Switch>
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
