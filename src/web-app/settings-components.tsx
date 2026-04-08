/** @jsxImportSource solid-js */

import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";

import type {
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppPluginState,
  GranolaAppState,
  GranolaExportTarget,
  GranolaAppSyncRun,
} from "../app/index.ts";
import { pluginStateStatusDetail } from "../app/plugin-state.ts";
import { granolaAgentProviderLabel } from "../agent-defaults.ts";
import { granolaAuthModeLabel, granolaAuthRecommendation } from "../auth-summary.ts";
import type { GranolaLocalPathInfo, GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import { describeAuthStatus, describeSyncStatus } from "../web/client-state.ts";
import type { GranolaWebExportMode } from "./types.ts";

import {
  buildIdentityLabel,
  buildStartedAtLabel,
  compactPathLabel,
  formatBytesLabel,
  formatDateTimeLabel,
  pathLeafLabel,
  providerSetupHint,
  relativeTimeLabel,
  scopeLabel,
  syncCadenceLabel,
} from "./component-helpers.ts";

interface AuthPanelProps {
  apiKeyDraft: string;
  auth?: GranolaAppAuthState;
  onApiKeyDraftChange: (value: string) => void;
  onClearApiKey: () => void;
  onImportDesktopSession: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onSaveApiKey: () => void;
  onSwitchMode: (mode: GranolaAppAuthState["mode"]) => void;
  preferredProvider: GranolaAgentProviderKind;
}

interface ExportJobsPanelProps {
  currentScopeLabel: string;
  exportDestinationSummary: string;
  exportMode: GranolaWebExportMode;
  jobs: GranolaAppExportJobState[];
  onExportModeChange: (mode: GranolaWebExportMode) => void;
  onRerun: (id: string) => void;
  onRunExport: () => void;
  onSelectTarget: (id: string | null) => void;
  selectedTargetId: string | null;
  targets: GranolaExportTarget[];
}

interface PluginsPanelProps {
  onTogglePlugin: (id: string, enabled: boolean) => void;
  plugins: GranolaAppPluginState[];
}

function CopyPathButton(props: { value?: string; variant?: "icon" | "text" }): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (resetTimer) {
      clearTimeout(resetTimer);
    }
  });

  const copy = async () => {
    if (!props.value?.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(props.value);
      setCopied(true);
      if (resetTimer) {
        clearTimeout(resetTimer);
      }
      resetTimer = setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      aria-label={copied() ? "Copied" : "Copy path"}
      class={props.variant === "icon" ? "copy-icon-button" : "mini-button"}
      disabled={!props.value?.trim()}
      onClick={() => void copy()}
      title={copied() ? "Copied" : "Copy path"}
      type="button"
    >
      <Show when={props.variant === "icon"} fallback={copied() ? "Copied" : "Copy path"}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <Show
            when={copied()}
            fallback={
              <path d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10V1Zm3 4H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H10V7h9v14Z" />
            }
          >
            <path d="M9.6 16.6 6 13l1.4-1.4 2.2 2.2 6-6L17 9.2l-7.4 7.4Z" />
          </Show>
        </svg>
      </Show>
    </button>
  );
}

function DiagnosticsMetricCard(props: {
  detail?: string;
  label: string;
  meta?: string;
  title: string;
}): JSX.Element {
  return (
    <article class="diagnostic-card">
      <span class="status-label">{props.label}</span>
      <strong>{props.title}</strong>
      <Show when={props.meta}>{(meta) => <span class="diagnostic-card__meta">{meta()}</span>}</Show>
      <Show when={props.detail}>
        {(detail) => <span class="diagnostic-card__detail">{detail()}</span>}
      </Show>
    </article>
  );
}

function DiagnosticsFileRow(props: {
  detail?: string;
  file?: GranolaLocalPathInfo;
  fallbackPath?: string;
  label: string;
  missingDetail?: string;
  missingStateLabel?: string;
  title: string;
}): JSX.Element {
  const path = () => props.file?.path || props.fallbackPath;
  const pathLabel = () => (props.file?.exists === false ? "Expected path" : "Path");
  const pathLeaf = () => {
    const value = path();
    if (!value) {
      return undefined;
    }

    const leaf = pathLeafLabel(value);
    return leaf === props.title ? undefined : leaf;
  };
  const meta = () => {
    const parts = [
      props.file?.exists === false ? (props.missingStateLabel ?? "Not created yet") : null,
      props.file?.sizeBytes != null ? formatBytesLabel(props.file.sizeBytes) : null,
      props.file?.updatedAt ? `updated ${relativeTimeLabel(props.file.updatedAt)}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };
  const detail = () =>
    props.file?.exists === false && props.missingDetail ? props.missingDetail : props.detail;

  return (
    <article class="diagnostic-file-row">
      <div class="diagnostic-file-row__identity">
        <span class="status-label">{props.label}</span>
        <strong>{props.title}</strong>
        <Show when={pathLeaf()}>
          {(value) => <span class="diagnostic-card__meta">{value()}</span>}
        </Show>
      </div>
      <div class="diagnostic-file-row__path">
        <label class="diagnostic-path-field">
          <span class="diagnostic-path-field__label">{pathLabel()}</span>
          <input
            class="diagnostic-path-field__input"
            readonly
            spellcheck={false}
            type="text"
            value={path() || "Not configured"}
          />
        </label>
      </div>
      <div class="diagnostic-file-row__details">
        <Show when={meta()}>
          {(value) => <span class="diagnostic-card__detail">{value()}</span>}
        </Show>
        <Show when={detail()}>
          {(value) => <span class="diagnostic-card__detail">{value()}</span>}
        </Show>
      </div>
      <div class="diagnostic-file-row__actions">
        <CopyPathButton value={path()} variant="icon" />
      </div>
    </article>
  );
}

function syncRunOccurredAt(run: GranolaAppSyncRun): string {
  return run.completedAt || run.failedAt || run.startedAt;
}

function syncRunStatusLabel(run: GranolaAppSyncRun): string {
  return run.status === "failed" ? "Failed" : "Succeeded";
}

function syncRunResultTitle(run: GranolaAppSyncRun): string {
  if (run.status === "failed") {
    return "Sync failed";
  }

  if (run.changeCount === 0) {
    return "No changes";
  }

  return `${run.changeCount} change${run.changeCount === 1 ? "" : "s"}`;
}

function syncRunResultDetail(run: GranolaAppSyncRun): string {
  if (run.status === "failed") {
    return run.error || "No error message recorded.";
  }

  if (!run.summary) {
    return "No sync summary recorded.";
  }

  return [
    `${run.summary.meetingCount} meetings`,
    `${run.summary.createdCount} created`,
    `${run.summary.changedCount} changed`,
    `${run.summary.removedCount} removed`,
    `${run.summary.transcriptReadyCount} transcripts ready`,
    `${run.summary.folderCount} folders`,
  ].join(" · ");
}

function SyncRunHistoryPanel(props: { runs?: GranolaAppSyncRun[] }): JSX.Element {
  const runs = () => props.runs ?? [];
  const [selectedRunId, setSelectedRunId] = createSignal<string | null>(runs()[0]?.id ?? null);

  createEffect(() => {
    const current = selectedRunId();
    const availableRuns = runs();
    if (availableRuns.length === 0) {
      if (current !== null) {
        setSelectedRunId(null);
      }
      return;
    }

    if (!current || !availableRuns.some((run) => run.id === current)) {
      setSelectedRunId(availableRuns[0]!.id);
    }
  });

  const selectedRun = () => runs().find((run) => run.id === selectedRunId()) ?? runs()[0] ?? null;

  return (
    <section class="detail-section">
      <div class="section-head">
        <div>
          <h2>Recent sync runs</h2>
          <p>
            Each background or manual sync leaves behind a local result summary you can inspect.
          </p>
        </div>
      </div>
      <Show
        when={runs().length > 0}
        fallback={
          <p class="section-note">
            No sync runs have been recorded yet. The first completed sync will appear here.
          </p>
        }
      >
        <div class="sync-run-history">
          <div class="sync-run-list" role="list">
            <For each={runs()}>
              {(run) => (
                <button
                  class="sync-run-list__item"
                  data-selected={selectedRunId() === run.id ? "true" : undefined}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  <span class="status-label">{syncRunStatusLabel(run)}</span>
                  <strong>{syncRunResultTitle(run)}</strong>
                  <span class="diagnostic-card__meta">
                    {relativeTimeLabel(syncRunOccurredAt(run))}
                  </span>
                  <span class="diagnostic-card__detail">{syncRunResultDetail(run)}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={selectedRun()}>
            {(run) => {
              const selected = run();
              const summary = selected.summary;
              return (
                <article class="sync-run-detail">
                  <div class="sync-run-detail__head">
                    <div>
                      <span class="status-label">Selected run</span>
                      <strong>{syncRunStatusLabel(selected)}</strong>
                      <span class="diagnostic-card__meta">
                        {formatDateTimeLabel(syncRunOccurredAt(selected))}
                      </span>
                    </div>
                    <div
                      class="state-badge"
                      data-tone={selected.status === "failed" ? "error" : "ok"}
                    >
                      {syncRunResultTitle(selected)}
                    </div>
                  </div>
                  <div class="diagnostic-card-grid diagnostic-card-grid--metrics">
                    <DiagnosticsMetricCard
                      detail={formatDateTimeLabel(selected.startedAt)}
                      label="Started"
                      meta={relativeTimeLabel(selected.startedAt)}
                      title="Run started"
                    />
                    <DiagnosticsMetricCard
                      detail={formatDateTimeLabel(syncRunOccurredAt(selected))}
                      label={selected.status === "failed" ? "Failed" : "Completed"}
                      meta={relativeTimeLabel(syncRunOccurredAt(selected))}
                      title={syncRunStatusLabel(selected)}
                    />
                    <DiagnosticsMetricCard
                      detail={
                        summary
                          ? `${summary.createdCount} created · ${summary.changedCount} changed · ${summary.removedCount} removed`
                          : "No summary recorded."
                      }
                      label="Changes"
                      meta={
                        selected.changeCount > selected.changes.length
                          ? `Showing ${selected.changes.length} of ${selected.changeCount}`
                          : undefined
                      }
                      title={`${selected.changeCount} change${selected.changeCount === 1 ? "" : "s"}`}
                    />
                    <DiagnosticsMetricCard
                      detail={
                        summary
                          ? `${summary.folderCount} folders · ${summary.transcriptReadyCount} transcripts ready`
                          : selected.error || "No sync summary recorded."
                      }
                      label="Result"
                      meta={summary ? undefined : "Failure details"}
                      title={
                        summary
                          ? `${summary.meetingCount} meetings checked`
                          : syncRunResultTitle(selected)
                      }
                    />
                  </div>
                  <Show when={selected.status === "failed" && selected.error}>
                    {(error) => <p class="auth-card__meta auth-card__error">{error()}</p>}
                  </Show>
                  <Show
                    when={selected.changes.length > 0}
                    fallback={
                      <p class="section-note">
                        {selected.status === "failed"
                          ? "This run failed before any meeting changes were recorded."
                          : "No meeting changes were detected in this run."}
                      </p>
                    }
                  >
                    <div class="sync-run-change-list">
                      <For each={selected.changes}>
                        {(change) => (
                          <article class="sync-run-change-row">
                            <div>
                              <span class="status-label">{change.kind.replaceAll("-", " ")}</span>
                              <strong>{change.title || change.meetingId}</strong>
                            </div>
                            <span class="diagnostic-card__detail">
                              {change.updatedAt
                                ? `Updated ${formatDateTimeLabel(change.updatedAt)}`
                                : change.meetingId}
                            </span>
                          </article>
                        )}
                      </For>
                    </div>
                  </Show>
                </article>
              );
            }}
          </Show>
        </div>
      </Show>
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
  const syncSummary = () => sync()?.summary;
  const syncResultLabel = () => {
    const summary = syncSummary();
    if (!summary) {
      return "No completed sync summary yet";
    }

    return `${summary.meetingCount} meetings · ${summary.changedCount} changed`;
  };
  const syncResultDetail = () => {
    const summary = syncSummary();
    if (!summary) {
      return "Run sync once to populate local index and change tracking.";
    }

    return `${summary.createdCount} created · ${summary.removedCount} removed · ${summary.transcriptReadyCount} transcripts ready · ${summary.folderCount} folders`;
  };
  const transcriptStateDetail = () =>
    props.appState?.cache.loaded && props.appState.cache.transcriptCount > 0
      ? `Read ${formatDateTimeLabel(props.appState.cache.loadedAt)} · ${props.appState.cache.transcriptCount} transcript sets available locally.`
      : props.appState?.cache.loaded
        ? "Desktop transcript file was read, but it does not currently contain transcript entries."
        : props.appState?.cache.filePath || props.serverInfo?.config.transcriptCacheFile
          ? "Toolkit can read transcript data from the configured desktop transcript file when needed."
          : "Meeting transcripts are fetched from Granola when you open them.";
  const fallbackSummary = () => {
    const available = [
      auth()?.apiKeyAvailable ? "API key" : null,
      auth()?.storedSessionAvailable ? "desktop session" : null,
      auth()?.supabaseAvailable ? "supabase.json" : null,
    ].filter(Boolean);

    return available.length > 0 ? available.join(" · ") : "No fallback auth sources detected";
  };
  const localFiles = () =>
    [
      {
        detail: props.appState?.config.configFileUsed
          ? "Custom config file currently in use."
          : "No custom config file found. Change values from the Auth, Plugins, and Exports tabs, or add a .granola.toml later.",
        fallbackPath: props.appState?.config.configFileUsed || undefined,
        file: props.serverInfo?.files?.config,
        label: "Config file",
        title: props.appState?.config.configFileUsed
          ? "Custom .granola.toml"
          : "No custom config file",
      },
      {
        detail: "Toolkit-owned local state directory.",
        fallbackPath: props.serverInfo?.persistence.dataDirectory,
        file: props.serverInfo?.files?.dataDirectory,
        label: "Data directory",
        title: "Local toolkit data",
      },
      {
        detail: props.appState?.index.loaded
          ? `${props.appState.index.meetingCount} meetings indexed locally`
          : "Meeting index is available but not warmed yet.",
        fallbackPath:
          props.appState?.index.filePath || props.serverInfo?.persistence.meetingIndexFile,
        file: props.serverInfo?.files?.meetingIndex,
        label: "Meeting index",
        missingDetail: "This file will be created after the first successful sync.",
        title: props.appState?.index.loaded
          ? `${props.appState.index.meetingCount} meetings in local index`
          : "Local meeting index",
      },
      {
        detail:
          "Snapshot used when the toolkit can serve known local state before hitting Granola.",
        fallbackPath: props.serverInfo?.persistence.catalogSnapshotFile,
        file: props.serverInfo?.files?.catalogSnapshot,
        label: "Catalog snapshot",
        missingDetail: "This file will be created after the first successful sync.",
        title: "Catalog snapshot",
      },
      {
        detail: transcriptStateDetail(),
        fallbackPath:
          props.appState?.cache.filePath || props.serverInfo?.config.transcriptCacheFile,
        file: props.serverInfo?.files?.transcriptCache,
        label: "Desktop transcript data",
        missingDetail:
          "This configured desktop transcript file is not present yet. Granola Toolkit will fetch transcripts on demand until it appears.",
        missingStateLabel: "Not found on disk",
        title: props.appState?.cache.filePath ? "Desktop transcript file" : "Transcripts on demand",
      },
      {
        detail: props.appState?.sync.eventsFile
          ? `${pathLeafLabel(props.appState.sync.eventsFile)} records every sync result, including failures and changed meetings.`
          : "Append-only sync history log with recent run results and changed meetings.",
        fallbackPath:
          props.appState?.sync.eventsFile || props.serverInfo?.persistence.syncEventsFile,
        file: props.serverInfo?.files?.syncEvents,
        label: "Sync history log",
        missingDetail: "This log file will be created after the first sync run finishes.",
        title: "Sync run history",
      },
      {
        detail:
          "Stores the latest sync status, timestamps, summary counts, and recent run pointers.",
        fallbackPath: props.appState?.sync.filePath || props.serverInfo?.persistence.syncStateFile,
        file: props.serverInfo?.files?.syncState,
        label: "Sync state",
        missingDetail: "This file will be created after the first sync run finishes.",
        title: "Sync state file",
      },
      {
        detail:
          "Background service stdout and startup diagnostics are written here while the service is running.",
        fallbackPath: props.serverInfo?.persistence.serviceLogFile,
        file: props.serverInfo?.files?.serviceLog,
        label: "Service log",
        missingDetail: "This log file will be created the next time the background service starts.",
        title: "Background service log",
      },
      {
        detail: "Stores plugin enablement and plugin-local settings.",
        fallbackPath:
          props.appState?.config.plugins?.settingsFile || props.serverInfo?.config.pluginsFile,
        file: props.serverInfo?.files?.pluginSettings,
        label: "Plugin settings",
        missingDetail:
          "This file will be created when you first change a plugin setting or enable a plugin-local configuration.",
        title: "Plugin settings",
      },
      {
        detail: "Named export profiles for local archives, vaults, and future integrations.",
        fallbackPath:
          props.appState?.config.exports?.targetsFile || props.serverInfo?.config.exportTargetsFile,
        file: props.serverInfo?.files?.exportTargets,
        label: "Export targets",
        missingDetail:
          "This file will be created when you first save a named export target/profile.",
        title: "Export target profiles",
      },
      {
        detail: "Loaded when automation rules are enabled.",
        fallbackPath:
          props.appState?.config.automation?.rulesFile ||
          props.serverInfo?.config.automationRulesFile,
        file: props.serverInfo?.files?.automationRules,
        label: "Automation rules",
        missingDetail:
          "This file will be created when you first save automation rules or enable automation workflows.",
        title: "Automation rules",
      },
    ] as const;

  return (
    <section class="jobs-panel diagnostics-panel">
      <div class="jobs-panel__head">
        <h3>Sync and local files</h3>
        <p>
          See when the toolkit last synced, which auth/runtime path it is using, and which local
          files back the current view.
        </p>
      </div>
      <div class="diagnostics-grid">
        <section class="detail-section">
          <h2>Sync activity</h2>
          <div class="diagnostic-card-grid diagnostic-card-grid--metrics">
            <DiagnosticsMetricCard
              detail={sync()?.lastError ? sync()?.lastError : syncCadenceLabel(props.serverInfo)}
              label="Sync status"
              meta={props.statusLabel}
              title={describeSyncStatus(sync() ?? {})}
            />
            <DiagnosticsMetricCard
              detail={
                sync()?.lastCompletedAt
                  ? formatDateTimeLabel(sync()?.lastCompletedAt)
                  : "No completed sync yet."
              }
              label="Last completed"
              meta={
                sync()?.lastCompletedAt
                  ? `Finished ${relativeTimeLabel(sync()?.lastCompletedAt)}`
                  : undefined
              }
              title={
                sync()?.lastCompletedAt ? relativeTimeLabel(sync()?.lastCompletedAt) : "Not yet"
              }
            />
            <DiagnosticsMetricCard
              detail={
                sync()?.running ? "A sync run is in progress right now." : "No sync is running."
              }
              label="Last started"
              meta={sync()?.lastStartedAt ? formatDateTimeLabel(sync()?.lastStartedAt) : undefined}
              title={
                sync()?.lastStartedAt ? relativeTimeLabel(sync()?.lastStartedAt) : "Not recorded"
              }
            />
            <DiagnosticsMetricCard
              detail={syncResultDetail()}
              label="Last result"
              meta={syncSummary() ? undefined : "Run sync once to populate local change tracking."}
              title={syncResultLabel()}
            />
          </div>
        </section>
        <SyncRunHistoryPanel runs={sync()?.recentRuns} />
        <section class="detail-section">
          <h2>Local files</h2>
          <div class="diagnostic-file-list">
            <For each={localFiles()}>
              {(entry) => (
                <DiagnosticsFileRow
                  detail={entry.detail}
                  fallbackPath={entry.fallbackPath}
                  file={entry.file}
                  label={entry.label}
                  title={entry.title}
                />
              )}
            </For>
          </div>
        </section>
        <section class="detail-section">
          <h2>Auth and runtime</h2>
          <div class="diagnostic-card-grid diagnostic-card-grid--metrics">
            <DiagnosticsMetricCard
              detail={`Mode: ${auth()?.mode || "unknown"}`}
              label="Active auth"
              meta={fallbackSummary()}
              title={describeAuthStatus(auth())}
            />
            <DiagnosticsMetricCard
              detail={`Started ${buildStartedAtLabel(props.serverInfo)}`}
              label="Runtime"
              meta={syncCadenceLabel(props.serverInfo)}
              title={props.serverInfo?.runtime.mode || "unknown"}
            />
            <DiagnosticsMetricCard
              detail={
                props.serverInfo?.build.repositoryUrl ||
                props.serverInfo?.build.packageName ||
                "unknown"
              }
              label="Build"
              meta={props.serverInfo?.build.gitCommitShort || undefined}
              title={buildIdentityLabel(props.serverInfo)}
            />
            <DiagnosticsMetricCard
              detail={
                props.serverInfo?.persistence.sessionStore === "keychain"
                  ? "Desktop-session tokens are stored in the OS keychain."
                  : props.serverInfo?.files?.session?.path || "Not reported"
              }
              label="Session store"
              meta={
                props.serverInfo?.persistence.sessionStore === "file" &&
                props.serverInfo?.files?.session?.sizeBytes != null
                  ? formatBytesLabel(props.serverInfo.files.session.sizeBytes)
                  : undefined
              }
              title={props.serverInfo?.persistence.sessionStore || "unknown"}
            />
          </div>
          <p class="auth-card__meta">
            Need a fresh local build? Run <code>npm run web:restart</code>.
          </p>
          <Show when={auth()?.lastError}>
            <p class="auth-card__meta auth-card__error">{auth()?.lastError}</p>
          </Show>
        </section>
      </div>
    </section>
  );
}

export function AuthPanel(props: AuthPanelProps): JSX.Element {
  const activeTone = (auth: GranolaAppAuthState) => {
    if (auth.lastError) {
      return "error";
    }

    return granolaAuthRecommendation(auth).status === "Recommended auth active" ? "ok" : "busy";
  };
  const fallbackSources = () => {
    const available = [
      props.auth?.storedSessionAvailable ? "Desktop session" : null,
      props.auth?.supabaseAvailable ? "supabase.json" : null,
    ].filter(Boolean);

    return available.length > 0 ? available.join(" · ") : "No fallbacks ready yet";
  };
  const authAvailabilityLabel = (available: boolean, readyLabel = "Ready") =>
    available ? readyLabel : "Unavailable";
  const savedApiKeyStatus = () => {
    if (!props.auth?.apiKeyAvailable) {
      return {
        detail:
          "No Personal API key is currently saved. Add one here to make it the default connection path.",
        title: "No saved key",
      };
    }

    if (props.auth.mode === "api-key") {
      return {
        detail: "This saved key is currently the active Granola connection source.",
        title: "Saved and active",
      };
    }

    return {
      detail: "A saved key is ready and can be switched to without re-entering it.",
      title: "Saved",
    };
  };

  return (
    <section class="auth-panel">
      <div class="auth-panel__head">
        <h3>Auth</h3>
        <p>
          Prefer a Granola Personal API key, then keep a desktop session and{" "}
          <code>supabase.json</code> as fallbacks when needed.
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
            <>
              <div class="auth-card auth-card--hero">
                <div class="auth-card__hero">
                  <div>
                    <span class="status-label">Connected with</span>
                    <div class="auth-card__title-row">
                      <strong class="auth-card__title">{granolaAuthModeLabel(auth().mode)}</strong>
                      <span class="state-badge" data-tone={activeTone(auth())}>
                        {granolaAuthRecommendation(auth()).status}
                      </span>
                    </div>
                    <p class="auth-card__lead">{granolaAuthRecommendation(auth()).detail}</p>
                  </div>
                  <Show when={auth().lastError}>
                    <div class="auth-card__meta auth-card__error">{auth().lastError}</div>
                  </Show>
                </div>
                <div class="diagnostic-card-grid diagnostic-card-grid--metrics">
                  <DiagnosticsMetricCard
                    detail={savedApiKeyStatus().detail}
                    label="Personal API key"
                    meta={auth().apiKeyAvailable ? "Stored in toolkit auth state" : undefined}
                    title={savedApiKeyStatus().title}
                  />
                  <DiagnosticsMetricCard
                    detail={fallbackSources()}
                    label="Fallback sources"
                    meta={
                      auth().storedSessionAvailable || auth().supabaseAvailable
                        ? "Available if the API key is missing or rate-limited"
                        : undefined
                    }
                    title={
                      auth().storedSessionAvailable || auth().supabaseAvailable
                        ? "Fallbacks ready"
                        : "No fallbacks ready"
                    }
                  />
                  <DiagnosticsMetricCard
                    detail={providerSetupHint(props.preferredProvider)}
                    label="Preferred agent provider"
                    meta="Runtime environment"
                    title={granolaAgentProviderLabel(props.preferredProvider)}
                  />
                </div>
                <div class="auth-detail-list">
                  <div class="auth-detail-row">
                    <span class="auth-detail-row__label">Desktop session</span>
                    <span class="auth-detail-row__value">
                      {authAvailabilityLabel(auth().storedSessionAvailable)}
                    </span>
                  </div>
                  <div class="auth-detail-row">
                    <span class="auth-detail-row__label">Refresh</span>
                    <span class="auth-detail-row__value">
                      {authAvailabilityLabel(
                        auth().storedSessionAvailable && auth().refreshAvailable,
                      )}
                    </span>
                  </div>
                  <Show when={auth().signInMethod}>
                    <div class="auth-detail-row">
                      <span class="auth-detail-row__label">Sign-in method</span>
                      <span class="auth-detail-row__value">{auth().signInMethod}</span>
                    </div>
                  </Show>
                  <Show when={auth().clientId}>
                    <div class="auth-detail-row">
                      <span class="auth-detail-row__label">Client ID</span>
                      <span class="auth-detail-row__value">{auth().clientId}</span>
                    </div>
                  </Show>
                  <Show when={auth().supabasePath}>
                    <div class="auth-detail-row auth-detail-row--path">
                      <div>
                        <span class="auth-detail-row__label">supabase.json</span>
                        <span class="auth-detail-row__value">
                          {compactPathLabel(auth().supabasePath)}
                        </span>
                      </div>
                      <CopyPathButton value={auth().supabasePath} />
                    </div>
                  </Show>
                </div>
                <Show when={granolaAuthRecommendation(auth()).nextAction}>
                  {(nextAction) => <div class="auth-card__meta">Next step: {nextAction()}</div>}
                </Show>
              </div>

              <div class="auth-card">
                <div class="auth-section-head">
                  <div>
                    <span class="status-label">Saved API key</span>
                    <h4>Manage the saved key</h4>
                  </div>
                  <p>
                    <Show
                      when={auth().apiKeyAvailable}
                      fallback={
                        <>
                          Save a Personal API key here for the default connection path. You can also
                          use <code>granola auth login --api-key &lt;token&gt;</code>.
                        </>
                      }
                    >
                      <>
                        A Personal API key is already saved. Paste a new one to rotate it, switch to
                        it when needed, or remove it without touching desktop-session fallbacks.
                      </>
                    </Show>
                  </p>
                </div>
                <div class="auth-card__meta">
                  <strong>{savedApiKeyStatus().title}.</strong> {savedApiKeyStatus().detail}
                </div>
                <div class="auth-inline">
                  <input
                    class="input"
                    onInput={(event) => {
                      props.onApiKeyDraftChange(event.currentTarget.value);
                    }}
                    placeholder={
                      auth().apiKeyAvailable
                        ? "Paste a new grn_... to replace the saved key"
                        : "grn_..."
                    }
                    type="password"
                    value={props.apiKeyDraft}
                  />
                  <button
                    class="button button--secondary"
                    onClick={props.onSaveApiKey}
                    type="button"
                  >
                    {auth().apiKeyAvailable ? "Save new key" : "Save API key"}
                  </button>
                </div>
                <div class="auth-card__actions">
                  <button
                    class="button button--secondary"
                    disabled={!auth().apiKeyAvailable || auth().mode === "api-key"}
                    onClick={() => {
                      props.onSwitchMode("api-key");
                    }}
                    type="button"
                  >
                    {auth().apiKeyAvailable && auth().mode === "api-key"
                      ? "Using saved key"
                      : "Use saved key"}
                  </button>
                  <button
                    class="button button--secondary"
                    disabled={!auth().apiKeyAvailable}
                    onClick={props.onClearApiKey}
                    type="button"
                  >
                    Remove saved key
                  </button>
                </div>
              </div>

              <div class="auth-card">
                <div class="auth-section-head">
                  <div>
                    <span class="status-label">Fallbacks</span>
                    <h4>Switch or refresh another source</h4>
                  </div>
                  <p>
                    Desktop session import and <code>supabase.json</code> stay available when the
                    default API-key path needs help.
                  </p>
                </div>
                <div class="auth-card__actions">
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
            </>
          )}
        </Show>
      </div>
    </section>
  );
}

export function PluginsPanel(props: PluginsPanelProps): JSX.Element {
  const renderPluginCard = (input: { detail: string; plugin: GranolaAppPluginState }) => (
    <div class="auth-card">
      <div class="status-grid">
        <div>
          <span class="status-label">Plugin</span>
          <strong>{input.plugin.label}</strong>
        </div>
        <div>
          <span class="status-label">Shipped</span>
          <strong>{input.plugin.shipped ? "yes" : "no"}</strong>
        </div>
        <div>
          <span class="status-label">Status</span>
          <strong>{input.plugin.enabled ? "enabled" : "disabled"}</strong>
        </div>
        <div>
          <span class="status-label">Configurable</span>
          <strong>{input.plugin.configurable ? "yes" : "no"}</strong>
        </div>
      </div>
      <div class="auth-card__meta">{input.plugin.description}</div>
      <div class="auth-card__meta">{input.detail}</div>
      <div class="auth-card__actions">
        <button
          class="button button--secondary"
          onClick={() => {
            props.onTogglePlugin(input.plugin.id, !input.plugin.enabled);
          }}
          type="button"
        >
          {input.plugin.enabled
            ? `Disable ${input.plugin.label.toLowerCase()}`
            : `Enable ${input.plugin.label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );

  return (
    <section class="auth-panel">
      <div class="auth-panel__head">
        <h3>Plugins</h3>
        <p>
          Shipped capabilities are loaded from the toolkit plugin registry and can be enabled here.
        </p>
      </div>
      <div class="auth-panel__body">
        <Show
          when={props.plugins.length > 0}
          fallback={<div class="auth-card__meta">No plugins loaded yet.</div>}
        >
          <For each={props.plugins}>
            {(plugin) =>
              renderPluginCard({
                detail: pluginStateStatusDetail(plugin),
                plugin,
              })
            }
          </For>
        </Show>
      </div>
    </section>
  );
}

export function ExportJobsPanel(props: ExportJobsPanelProps): JSX.Element {
  return (
    <>
      <section class="auth-panel">
        <div class="auth-panel__head">
          <h3>Bundled export</h3>
          <p>
            Export notes and transcripts together for the current scope, then reuse named targets
            when you want a vault or archive destination instead of raw paths.
          </p>
        </div>
        <div class="auth-panel__body">
          <div class="auth-card-grid auth-card-grid--three">
            <article class="auth-card">
              <span class="status-label">Scope</span>
              <strong>{props.currentScopeLabel}</strong>
              <span class="auth-card__meta">
                The bundled export uses the current folder scope when one is selected.
              </span>
            </article>
            <article class="auth-card">
              <span class="status-label">Target</span>
              <strong>{props.selectedTargetId || "Default local archive"}</strong>
              <span class="auth-card__meta">{props.exportDestinationSummary}</span>
            </article>
            <article class="auth-card">
              <span class="status-label">Contents</span>
              <strong>
                {props.exportMode === "both"
                  ? "Notes + transcripts"
                  : props.exportMode === "notes"
                    ? "Notes only"
                    : "Transcripts only"}
              </strong>
              <span class="auth-card__meta">
                Change this only when you want a narrower one-off export.
              </span>
            </article>
          </div>
          <div class="field-row field-row--inline">
            <label>
              <span class="field-label">Destination</span>
              <select
                class="select"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  props.onSelectTarget(value ? value : null);
                }}
                value={props.selectedTargetId ?? ""}
              >
                <option value="">Default local archive</option>
                <For each={props.targets}>
                  {(target) => <option value={target.id}>{target.name ?? target.id}</option>}
                </For>
              </select>
            </label>
            <label>
              <span class="field-label">Contents</span>
              <select
                class="select"
                onChange={(event) => {
                  props.onExportModeChange(event.currentTarget.value as GranolaWebExportMode);
                }}
                value={props.exportMode}
              >
                <option value="both">Notes + transcripts</option>
                <option value="notes">Notes only</option>
                <option value="transcripts">Transcripts only</option>
              </select>
            </label>
          </div>
          <div class="toolbar-actions">
            <button
              class="button button--primary"
              onClick={() => props.onRunExport()}
              type="button"
            >
              Export archive
            </button>
          </div>
        </div>
      </section>
      <section class="jobs-panel">
        <div class="jobs-panel__head">
          <h3>Recent export jobs</h3>
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
    </>
  );
}
