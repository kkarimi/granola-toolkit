/** @jsxImportSource solid-js */

import { For, Show, type JSX } from "solid-js";

import type {
  FolderSummaryRecord,
  GranolaAutomationActionRun,
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppState,
  GranolaExportScope,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  MeetingRecord,
  MeetingSummaryRecord,
} from "../app/index.ts";
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

interface ToolbarFiltersProps {
  onQuickOpen: () => void;
  onQuickOpenInput: (value: string) => void;
  onSearchInput: (value: string) => void;
  onSortChange: (value: GranolaMeetingSort) => void;
  onUpdatedFromChange: (value: string) => void;
  onUpdatedToChange: (value: string) => void;
  quickOpen: string;
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
  error?: string;
  emptyHint?: string;
  folders: FolderSummaryRecord[];
  meetings: MeetingSummaryRecord[];
  onSelect: (meetingId: string) => void;
  search: string;
  selectedFolderId?: string | null;
  selectedMeetingId?: string | null;
  updatedFrom: string;
  updatedTo: string;
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

interface WorkspaceProps {
  bundle: GranolaMeetingBundle | null;
  detailError?: string;
  onSelectTab: (tab: WorkspaceTab) => void;
  selectedMeeting: MeetingRecord | null;
  tab: WorkspaceTab;
}

function authModeLabel(mode: GranolaAppAuthState["mode"]): string {
  switch (mode) {
    case "api-key":
      return "API key";
    case "stored-session":
      return "Stored session";
    default:
      return "supabase.json";
  }
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

export function ToolbarFilters(props: ToolbarFiltersProps): JSX.Element {
  return (
    <>
      <section class="hero">
        <h1>Granola Toolkit</h1>
        <p>
          Browser workspace for folders, meetings, notes, transcripts, and export flows on top of
          one local server instance.
        </p>
        <input
          class="search"
          onInput={(event) => {
            props.onSearchInput(event.currentTarget.value);
          }}
          placeholder="Search meetings, ids, or tags"
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
      <section class="toolbar">
        <div>
          <p>
            Meetings are loaded from the shared server state so this view can stay aligned with the
            terminal UI and sync loop.
          </p>
        </div>
        <div class="toolbar-form">
          <input
            class="field-input"
            onInput={(event) => {
              props.onQuickOpenInput(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onQuickOpen();
              }
            }}
            placeholder="Quick open by id or title"
            value={props.quickOpen}
          />
          <button class="button button--secondary" onClick={props.onQuickOpen} type="button">
            Open
          </button>
        </div>
      </section>
    </>
  );
}

export function FolderList(props: FolderListProps): JSX.Element {
  return (
    <section class="folder-panel">
      <div class="folder-panel__head">
        <h2>Folders</h2>
        <p>Pick a folder to scope the meeting browser, or stay on All meetings.</p>
      </div>
      <div class="folder-list">
        <Show
          fallback={
            <>
              <button
                class="folder-row"
                data-selected={!props.selectedFolderId ? "true" : undefined}
                onClick={() => {
                  props.onSelect(null);
                }}
                type="button"
              >
                <span class="folder-row__title">All meetings</span>
                <span class="folder-row__meta">Browse the full meeting list.</span>
              </button>
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
          }
          when={!props.error}
        >
          <div class="folder-empty folder-empty--error">{props.error}</div>
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
      <Show
        fallback={
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
        }
        when={props.error}
      >
        <div class="meeting-empty meeting-empty--error">{props.error}</div>
      </Show>
    </section>
  );
}

export function AppStatePanel(props: {
  appState?: GranolaAppState | null;
  statusLabel: string;
  statusTone: WebStatusTone;
}): JSX.Element {
  const syncStatus = () => describeSyncStatus(props.appState?.sync ?? {});
  const authStatus = () => describeAuthStatus(props.appState?.auth);

  return (
    <section class="detail-head">
      <div>
        <h2>Meeting Workspace</h2>
        <Show fallback={<p>Waiting for server state…</p>} when={props.appState}>
          {(appState) => (
            <div class="status-grid">
              <div>
                <span class="status-label">Surface</span>
                <strong>{appState().ui.surface}</strong>
              </div>
              <div>
                <span class="status-label">View</span>
                <strong>{appState().ui.view}</strong>
              </div>
              <div>
                <span class="status-label">Auth</span>
                <strong>{authStatus()}</strong>
              </div>
              <div>
                <span class="status-label">Sync</span>
                <strong>{syncStatus()}</strong>
              </div>
              <div>
                <span class="status-label">Documents</span>
                <strong>
                  {appState().documents.loaded ? String(appState().documents.count) : "not loaded"}
                </strong>
              </div>
              <div>
                <span class="status-label">Folders</span>
                <strong>
                  {appState().folders.loaded ? String(appState().folders.count) : "not loaded"}
                </strong>
              </div>
              <div>
                <span class="status-label">Cache</span>
                <strong>
                  {appState().cache.loaded
                    ? `${appState().cache.transcriptCount} transcript sets`
                    : appState().cache.configured
                      ? "configured"
                      : "not configured"}
                </strong>
              </div>
              <div>
                <span class="status-label">Index</span>
                <strong>
                  {appState().index.loaded
                    ? `${appState().index.meetingCount} meetings`
                    : appState().index.available
                      ? "available"
                      : "not built"}
                </strong>
              </div>
              <div>
                <span class="status-label">Automation</span>
                <strong>
                  {`${appState().automation.runCount} runs / ${appState().automation.pendingRunCount} pending`}
                </strong>
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
          Inspect, refresh, and switch between API key, stored session, and{" "}
          <code>supabase.json</code>.
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
                  <strong>{authModeLabel(auth().mode)}</strong>
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
                Store a Granola Personal API key here or use{" "}
                <code>granola auth login --api-key &lt;token&gt;</code>.
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
                  disabled={!auth().supabaseAvailable}
                  onClick={props.onImportDesktopSession}
                  type="button"
                >
                  Import desktop session
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

export function Workspace(props: WorkspaceProps): JSX.Element {
  const parsedTab = () => parseWorkspaceTab(props.tab);
  const details = () => {
    if (!props.selectedMeeting) {
      return null;
    }

    return workspaceBody(props.bundle, props.selectedMeeting, parsedTab());
  };

  return (
    <>
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
      <Show
        when={props.selectedMeeting}
        fallback={
          <div class="empty">
            {props.detailError || "Select a meeting to inspect its notes and transcript."}
          </div>
        }
      >
        {(meeting) => (
          <>
            <div class="detail-meta">
              <div class="detail-chip">{`ID: ${meeting().meeting.id}`}</div>
              <div class="detail-chip">{`Source: ${meeting().meeting.noteContentSource}`}</div>
              <div class="detail-chip">{`Transcript: ${meeting().meeting.transcriptSegmentCount} segments`}</div>
            </div>
            <Show when={!props.detailError} fallback={<div class="empty">{props.detailError}</div>}>
              <div class="detail-body">
                <div class="workspace-grid">
                  <aside class="detail-section workspace-sidebar">
                    <h2>Meeting Metadata</h2>
                    <pre class="detail-pre">{metadataLines(meeting())}</pre>
                  </aside>
                  <section class="detail-section workspace-main">
                    <h2>{details()?.title}</h2>
                    <pre class="detail-pre">{details()?.body}</pre>
                  </section>
                </div>
              </div>
            </Show>
          </>
        )}
      </Show>
    </>
  );
}
