/** @jsxImportSource solid-js */

import { createSignal, For, onCleanup, Show, type JSX } from "solid-js";

import type {
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppPluginState,
  GranolaAppState,
} from "../app/index.ts";
import { pluginStateStatusDetail } from "../app/plugin-state.ts";
import { granolaAgentProviderLabel } from "../agent-defaults.ts";
import { granolaAuthModeLabel, granolaAuthRecommendation } from "../auth-summary.ts";
import type { GranolaLocalPathInfo, GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import { describeAuthStatus, describeSyncStatus } from "../web/client-state.ts";

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
  onImportDesktopSession: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onSaveApiKey: () => void;
  onSwitchMode: (mode: GranolaAppAuthState["mode"]) => void;
  preferredProvider: GranolaAgentProviderKind;
}

interface ExportJobsPanelProps {
  jobs: GranolaAppExportJobState[];
  onRerun: (id: string) => void;
}

interface PluginsPanelProps {
  onTogglePlugin: (id: string, enabled: boolean) => void;
  plugins: GranolaAppPluginState[];
}

function CopyPathButton(props: { value?: string }): JSX.Element {
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
      class="mini-button"
      disabled={!props.value?.trim()}
      onClick={() => void copy()}
      type="button"
    >
      {copied() ? "Copied" : "Copy path"}
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

function DiagnosticsFileCard(props: {
  detail?: string;
  file?: GranolaLocalPathInfo;
  fallbackPath?: string;
  label: string;
  title: string;
}): JSX.Element {
  const path = () => props.file?.path || props.fallbackPath;
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
      props.file?.sizeBytes != null ? formatBytesLabel(props.file.sizeBytes) : null,
      props.file?.updatedAt ? `updated ${relativeTimeLabel(props.file.updatedAt)}` : null,
      props.file?.exists === false ? "missing" : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };

  return (
    <article class="diagnostic-card diagnostic-card--file">
      <div class="diagnostic-card__head">
        <span class="status-label">{props.label}</span>
        <CopyPathButton value={path()} />
      </div>
      <strong>{props.title}</strong>
      <Show when={pathLeaf()}>
        {(value) => <span class="diagnostic-card__meta">{value()}</span>}
      </Show>
      <Show when={path()}>
        {(value) => <span class="diagnostic-card__detail">{compactPathLabel(value())}</span>}
      </Show>
      <Show when={meta()}>{(value) => <span class="diagnostic-card__detail">{value()}</span>}</Show>
      <Show when={props.detail}>
        {(detail) => <span class="diagnostic-card__detail">{detail()}</span>}
      </Show>
    </article>
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
      ? `Loaded ${formatDateTimeLabel(props.appState.cache.loadedAt)}`
      : props.appState?.cache.loaded
        ? "Cache file loaded, but it does not currently contain transcript entries."
        : props.appState?.cache.filePath || props.serverInfo?.config.transcriptCacheFile
          ? "Toolkit can warm transcripts from the configured Granola cache file."
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
        title: "Catalog snapshot",
      },
      {
        detail: transcriptStateDetail(),
        fallbackPath:
          props.appState?.cache.filePath || props.serverInfo?.config.transcriptCacheFile,
        file: props.serverInfo?.files?.transcriptCache,
        label: "Transcript cache",
        title: props.appState?.cache.filePath
          ? "Desktop transcript cache"
          : "Transcripts on demand",
      },
      {
        detail: props.appState?.sync.eventsFile
          ? `${pathLeafLabel(props.appState.sync.eventsFile)} tracks event history.`
          : "Tracks recent sync runs and changes.",
        fallbackPath: props.appState?.sync.filePath || props.serverInfo?.persistence.syncStateFile,
        file: props.serverInfo?.files?.syncState,
        label: "Sync state",
        title: "Sync state file",
      },
      {
        detail: "Stores plugin enablement and plugin-local settings.",
        fallbackPath:
          props.appState?.config.plugins?.settingsFile || props.serverInfo?.config.pluginsFile,
        file: props.serverInfo?.files?.pluginSettings,
        label: "Plugin settings",
        title: "Plugin settings",
      },
      {
        detail: "Loaded when automation rules are enabled.",
        fallbackPath:
          props.appState?.config.automation?.rulesFile ||
          props.serverInfo?.config.automationRulesFile,
        file: props.serverInfo?.files?.automationRules,
        label: "Automation rules",
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
        <section class="detail-section">
          <h2>Local files</h2>
          <div class="diagnostic-card-grid">
            <For each={localFiles()}>
              {(entry) => (
                <DiagnosticsFileCard
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
