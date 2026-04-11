/** @jsxImportSource solid-js */

import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js";

import type { GranolaAppState, GranolaAppSyncRun } from "../app/index.ts";
import type { GranolaReviewInboxSummary } from "../review-inbox.ts";
import { describeAuthStatus, describeSyncStatus } from "../web/client-state.ts";
import type { GranolaServerInfo } from "../transport.ts";

import {
  buildIdentityLabel,
  buildStartedAtLabel,
  formatBytesLabel,
  formatDateTimeLabel,
  pathLeafLabel,
  relativeTimeLabel,
  reviewSummaryLabel,
  syncCadenceLabel,
} from "./component-helpers.ts";

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

export function DiagnosticsMetricCard(props: {
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
  file?: import("../transport.ts").GranolaLocalPathInfo;
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
  automationEnabled: boolean;
  onOpenReviewPage: () => void;
  reviewSummary: GranolaReviewInboxSummary;
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
          : "No custom config file found. Change values from the Connection, Knowledge bases, and Advanced tabs, or add a project .gran/config.json later.",
        fallbackPath: props.appState?.config.configFileUsed || undefined,
        file: props.serverInfo?.files?.config,
        label: "Config file",
        title: props.appState?.config.configFileUsed ? "Config file" : "No custom config file",
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
          "This configured desktop transcript file is not present yet. Gran 👵🏻 will fetch transcripts on demand until it appears.",
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
        detail:
          "Saved knowledge-base profiles for local archives, vaults, and future integrations.",
        fallbackPath:
          props.appState?.config.exports?.targetsFile || props.serverInfo?.config.exportTargetsFile,
        file: props.serverInfo?.files?.exportTargets,
        label: "Knowledge bases",
        missingDetail: "This file will be created when you first save a knowledge base profile.",
        title: "Knowledge base profiles",
      },
      {
        detail: "Review publishing profiles used by automation before anything is written out.",
        fallbackPath:
          props.appState?.config.automation?.pkmTargetsFile ||
          props.serverInfo?.config.pkmTargetsFile,
        file: props.serverInfo?.files?.pkmTargets,
        label: "Review publishing",
        missingDetail: "This file will be created when you first save a review publishing profile.",
        title: "Review publishing profiles",
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
        <h3>Advanced diagnostics</h3>
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
          <h2>Advanced drafts and recoveries</h2>
          <div class="diagnostic-card-grid diagnostic-card-grid--metrics">
            <DiagnosticsMetricCard
              detail={
                props.automationEnabled
                  ? props.reviewSummary.total > 0
                    ? `${props.reviewSummary.recovery} recoveries · ${props.reviewSummary.publish} publish drafts · ${props.reviewSummary.approval} approvals`
                    : "Nothing is waiting right now."
                  : "Enable automation above if you want Gran to generate drafts and recovery work."
              }
              label="Attention"
              meta={
                props.automationEnabled && props.reviewSummary.total > 0
                  ? reviewSummaryLabel(props.reviewSummary)
                  : undefined
              }
              title={
                props.automationEnabled
                  ? props.reviewSummary.total > 0
                    ? `${props.reviewSummary.total} advanced item${props.reviewSummary.total === 1 ? "" : "s"}`
                    : "No advanced items waiting"
                  : "Automation disabled"
              }
            />
            <DiagnosticsMetricCard
              detail={
                props.automationEnabled
                  ? "Use the advanced review space when you need to approve, reject, rerun, or recover generated work."
                  : "Gran’s main product path stays simpler when these workflows are left off."
              }
              label="Where it lives"
              title="Advanced only"
            />
          </div>
          <div class="toolbar-actions">
            <button
              class="button button--secondary"
              disabled={!props.automationEnabled}
              onClick={() => props.onOpenReviewPage()}
              type="button"
            >
              Open drafts and recoveries
            </button>
          </div>
        </section>
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
          <h2>Connection and runtime</h2>
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
