/** @jsxImportSource solid-js */

import { For, Show, type JSX } from "solid-js";

import type {
  GranolaAppAuthState,
  GranolaAppExportJobState,
  GranolaAppPluginState,
  GranolaAppState,
} from "../app/index.ts";
import { pluginStateStatusDetail } from "../app/plugin-state.ts";
import { granolaAgentProviderLabel } from "../agent-defaults.ts";
import { granolaAuthModeLabel, granolaAuthRecommendation } from "../auth-summary.ts";
import type { GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";

import {
  buildIdentityLabel,
  buildStartedAtLabel,
  providerSetupHint,
  scopeLabel,
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
        <h3>Diagnostics and about</h3>
        <p>
          Runtime and storage details live here so the main workspace can stay user-facing while
          still giving power users a place to inspect internals.
        </p>
      </div>
      <div class="diagnostics-grid">
        <section class="detail-section">
          <h2>Runtime and build</h2>
          <div class="status-grid">
            <div>
              <span class="status-label">Status badge</span>
              <strong>{props.statusLabel}</strong>
            </div>
            <div>
              <span class="status-label">Build</span>
              <strong>{buildIdentityLabel(props.serverInfo)}</strong>
            </div>
            <div>
              <span class="status-label">Started</span>
              <strong>{buildStartedAtLabel(props.serverInfo)}</strong>
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
            <div>
              <span class="status-label">Package</span>
              <strong>{props.serverInfo?.build.packageName || "unknown"}</strong>
            </div>
            <div>
              <span class="status-label">Repository</span>
              <strong>{props.serverInfo?.build.repositoryUrl || "unknown"}</strong>
            </div>
          </div>
          <p class="auth-card__meta">
            Need a fresh local build? Run <code>npm run web:restart</code>.
          </p>
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
