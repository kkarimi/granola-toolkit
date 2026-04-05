/** @jsxImportSource solid-js */

import { For, Show, type JSX } from "solid-js";

import type {
  FolderSummaryRecord,
  GranolaAgentHarness,
  GranolaAppAuthState,
  GranolaAppState,
  GranolaAutomationRule,
} from "../app/index.ts";
import { defaultGranolaAgentModel, granolaAgentProviderLabel } from "../agent-defaults.ts";
import type { GranolaServerInfo } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";

export const starterHarnessId = "starter-meeting-notes";
export const starterRuleId = "starter-meeting-notes-review";
export const starterRuleActionId = "starter-meeting-notes-pipeline";

interface OnboardingStepCard {
  body: string;
  complete: boolean;
  cta?: string;
  detail?: string;
  id: "agent" | "connect" | "import";
  title: string;
}

export interface GranolaOnboardingState {
  activeStepId: OnboardingStepCard["id"] | null;
  complete: boolean;
  connected: boolean;
  pipelineReady: boolean;
  serviceDetail: string;
  serviceWarning?: string;
  stepCards: OnboardingStepCard[];
  synced: boolean;
  syncedMeetingCount: number;
}

export interface OnboardingPanelProps {
  apiKeyDraft: string;
  auth?: GranolaAppAuthState;
  folders: FolderSummaryRecord[];
  meetingsLoadedCount: number;
  onApiKeyDraftChange: (value: string) => void;
  onCreateStarterPipeline: () => void;
  onImportDesktopSession: () => void;
  onRunSync: () => void;
  onSaveApiKey: () => void;
  onSelectProvider: (provider: GranolaAgentProviderKind) => void;
  preferredProvider: GranolaAgentProviderKind;
  state: GranolaOnboardingState;
}

const providerOptions: Array<{
  description: string;
  provider: GranolaAgentProviderKind;
}> = [
  {
    description: "Use the local Codex CLI and your ChatGPT subscription.",
    provider: "codex",
  },
  {
    description: "Use an OPENROUTER_API_KEY and route to your preferred model.",
    provider: "openrouter",
  },
  {
    description: "Use an OPENAI_API_KEY with direct OpenAI access.",
    provider: "openai",
  },
];

function providerSetupHint(provider: GranolaAgentProviderKind): string {
  switch (provider) {
    case "codex":
      return "Codex uses your local `codex` CLI. Make sure `codex exec` works in this workspace before you rely on it for automation.";
    case "openai":
      return "OpenAI requires `OPENAI_API_KEY` or `GRANOLA_OPENAI_API_KEY` in the environment where the toolkit is running.";
    case "openrouter":
    default:
      return "OpenRouter requires `OPENROUTER_API_KEY` or `GRANOLA_OPENROUTER_API_KEY` in the environment where the toolkit is running.";
  }
}

function suggestedFolderLabel(folders: FolderSummaryRecord[]): string | undefined {
  if (folders.length === 1) {
    return folders[0]?.name;
  }

  return undefined;
}

function formatSyncInterval(syncIntervalMs?: number): string | undefined {
  if (!syncIntervalMs || !Number.isFinite(syncIntervalMs) || syncIntervalMs <= 0) {
    return undefined;
  }

  if (syncIntervalMs % 60_000 === 0) {
    const minutes = syncIntervalMs / 60_000;
    return minutes === 1 ? "every minute" : `every ${minutes} minutes`;
  }

  if (syncIntervalMs % 1_000 === 0) {
    const seconds = syncIntervalMs / 1_000;
    return seconds === 1 ? "every second" : `every ${seconds} seconds`;
  }

  return `every ${syncIntervalMs}ms`;
}

function describeService(serverInfo?: GranolaServerInfo | null): {
  detail: string;
  warning?: string;
} {
  const runtime = serverInfo?.runtime;
  const intervalLabel = formatSyncInterval(runtime?.syncIntervalMs);

  switch (runtime?.mode) {
    case "background-service":
      return {
        detail: runtime.syncEnabled
          ? `Background service active${intervalLabel ? ` · sync ${intervalLabel}` : ""}.`
          : "Background service active · sync is currently disabled.",
      };
    case "server":
      return {
        detail: runtime.syncEnabled
          ? `Connected to a local Granola server${intervalLabel ? ` · sync ${intervalLabel}` : ""}.`
          : "Connected to a local Granola server · sync is currently disabled.",
      };
    case "web-workspace":
      return {
        detail: runtime.syncEnabled
          ? `Foreground web session${intervalLabel ? ` · sync ${intervalLabel}` : ""} while this process stays open.`
          : "Foreground web session · sync is currently disabled.",
        warning:
          "Recommended: use the reusable background-service path for day-to-day sync and automation.",
      };
    default:
      return {
        detail: "Runtime information will appear once the web workspace finishes connecting.",
      };
  }
}

export function deriveOnboardingState(input: {
  appState?: GranolaAppState | null;
  automationRuleCount: number;
  harnesses: GranolaAgentHarness[];
  meetingsLoadedCount: number;
  serverInfo?: GranolaServerInfo | null;
}): GranolaOnboardingState {
  const auth = input.appState?.auth;
  const connected = Boolean(auth?.apiKeyAvailable || auth?.storedSessionAvailable);
  const synced = Boolean(input.appState?.sync.lastCompletedAt);
  const pipelineReady = input.harnesses.length > 0 && input.automationRuleCount > 0;
  const syncedMeetingCount = input.appState?.documents.count ?? input.meetingsLoadedCount;
  const service = describeService(input.serverInfo);

  const stepCards: OnboardingStepCard[] = [
    {
      body: "Store a Granola API key for the toolkit. Desktop session import stays available as a fallback.",
      complete: connected,
      cta: connected ? undefined : "Save API key",
      detail: connected
        ? `Connected via ${auth?.mode === "api-key" ? "API key" : auth?.mode === "stored-session" ? "stored session" : "fallback auth"}.`
        : "Recommended: use a Granola Personal API key from Settings → API.",
      id: "connect",
      title: "Connect Granola",
    },
    {
      body: "Run the first import so the local index has meetings, folders, notes, and transcript-ready events.",
      complete: synced,
      cta: synced ? undefined : "Import meetings",
      detail: synced
        ? `${syncedMeetingCount} meetings indexed locally.`
        : "This builds the local meeting index the workspace and automation layer rely on.",
      id: "import",
      title: "Import Meetings",
    },
    {
      body: "Choose the AI agent you want to use by default, then seed a starter reviewable notes pipeline.",
      complete: pipelineReady,
      cta: pipelineReady ? undefined : "Create starter pipeline",
      detail: pipelineReady
        ? "Starter harnesses and automation rules are ready."
        : "The starter pipeline generates reviewable meeting notes on transcript-ready events.",
      id: "agent",
      title: "Choose An Agent",
    },
  ];
  const activeStepId = stepCards.find((step) => !step.complete)?.id ?? null;

  return {
    activeStepId,
    complete: connected && synced && pipelineReady,
    connected,
    pipelineReady,
    serviceDetail: service.detail,
    serviceWarning: service.warning,
    stepCards,
    synced,
    syncedMeetingCount,
  };
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const filtered = items.filter((item) => item.id !== nextItem.id);
  return [...filtered, nextItem];
}

export function createStarterHarness(provider: GranolaAgentProviderKind): GranolaAgentHarness {
  return {
    id: starterHarnessId,
    match: {
      transcriptLoaded: true,
    },
    model: defaultGranolaAgentModel(provider),
    name: "Starter Meeting Notes",
    priority: 10,
    prompt: [
      "Turn this meeting into concise, high-signal notes for internal follow-up.",
      "",
      "Requirements:",
      "- lead with the most important outcome, not a play-by-play recap",
      "- capture decisions, action items, open questions, and risks",
      "- assign owners when the transcript makes them clear",
      "- call out uncertainty explicitly instead of inventing missing detail",
      "- optimise for a team reading this five minutes after the meeting ends",
    ].join("\n"),
    provider,
  };
}

export function createStarterRule(): GranolaAutomationRule {
  return {
    actions: [
      {
        approvalMode: "manual",
        harnessId: starterHarnessId,
        id: starterRuleActionId,
        kind: "agent",
        name: "Generate starter meeting notes",
        pipeline: {
          kind: "notes",
        },
      },
    ],
    id: starterRuleId,
    name: "Review starter notes when a transcript is ready",
    when: {
      eventKinds: ["transcript.ready"],
      transcriptLoaded: true,
    },
  };
}

export function buildStarterPipeline(existing: {
  harnesses: GranolaAgentHarness[];
  provider: GranolaAgentProviderKind;
  rules: GranolaAutomationRule[];
}): {
  harnesses: GranolaAgentHarness[];
  rule: GranolaAutomationRule;
  rules: GranolaAutomationRule[];
} {
  const harness = createStarterHarness(existing.provider);
  const rule = createStarterRule();
  return {
    harnesses: upsertById(existing.harnesses, harness),
    rule,
    rules: upsertById(existing.rules, rule),
  };
}

export function OnboardingPanel(props: OnboardingPanelProps): JSX.Element {
  const dominantFolder = () => suggestedFolderLabel(props.folders);

  return (
    <section class="onboarding-panel">
      <div class="onboarding-panel__hero">
        <div>
          <p class="onboarding-panel__eyebrow">First-Run Setup</p>
          <h2>Set up Granola Toolkit in three steps.</h2>
          <p>
            Add your Granola API key, import your meetings, and choose the agent that should draft
            reviewable notes. The goal is to reach one useful default without dropping you into
            every advanced panel on day one.
          </p>
        </div>
        <div class="onboarding-panel__summary">
          <div
            class="job-card__status"
            data-status={props.state.complete ? "completed" : "warning"}
          >
            {props.state.complete ? "Ready" : "Setup in progress"}
          </div>
          <div class="auth-card__meta">{props.state.serviceDetail}</div>
          <div class="auth-card__meta">
            {props.state.synced
              ? `${props.state.syncedMeetingCount} meetings indexed`
              : "No local sync yet"}
          </div>
          <Show when={dominantFolder()}>
            {(folderName) => (
              <div class="auth-card__meta">Single-folder workspace detected: {folderName()}</div>
            )}
          </Show>
        </div>
      </div>
      <Show when={props.state.serviceWarning}>
        {(warning) => <div class="onboarding-panel__warning">{warning()}</div>}
      </Show>

      <div class="onboarding-steps">
        <For each={props.state.stepCards}>
          {(step, index) => (
            <article
              class="onboarding-step"
              data-active={props.state.activeStepId === step.id}
              data-complete={step.complete}
            >
              <div class="onboarding-step__head">
                <div>
                  <span class="onboarding-step__number">Step {index() + 1}</span>
                  <h3>{step.title}</h3>
                </div>
                <div class="job-card__status" data-status={step.complete ? "completed" : "warning"}>
                  {step.complete ? "Done" : "Next"}
                </div>
              </div>
              <p>{step.body}</p>
              <Show when={step.detail}>
                {(detail) => <div class="auth-card__meta">{detail()}</div>}
              </Show>

              <Show when={step.id === "connect" && props.state.activeStepId === "connect"}>
                <div class="onboarding-step__body">
                  <input
                    class="input"
                    onInput={(event) => {
                      props.onApiKeyDraftChange(event.currentTarget.value);
                    }}
                    placeholder="grn_..."
                    type="password"
                    value={props.apiKeyDraft}
                  />
                  <div class="toolbar-actions">
                    <button
                      class="button button--primary"
                      onClick={props.onSaveApiKey}
                      type="button"
                    >
                      Save API key
                    </button>
                    <button
                      class="button button--secondary"
                      disabled={!props.auth?.supabaseAvailable}
                      onClick={props.onImportDesktopSession}
                      type="button"
                    >
                      Import desktop session
                    </button>
                  </div>
                </div>
              </Show>

              <Show when={step.id === "import" && props.state.activeStepId === "import"}>
                <div class="onboarding-step__body">
                  <button
                    class="button button--primary"
                    disabled={!props.state.connected}
                    onClick={props.onRunSync}
                    type="button"
                  >
                    Import meetings now
                  </button>
                </div>
              </Show>

              <Show when={step.id === "agent" && props.state.activeStepId === "agent"}>
                <div class="onboarding-step__body">
                  <div class="onboarding-providers">
                    <For each={providerOptions}>
                      {(option) => (
                        <button
                          class="onboarding-provider"
                          data-selected={props.preferredProvider === option.provider}
                          onClick={() => {
                            props.onSelectProvider(option.provider);
                          }}
                          type="button"
                        >
                          <span class="onboarding-provider__title">
                            {granolaAgentProviderLabel(option.provider)}
                          </span>
                          <span class="onboarding-provider__body">{option.description}</span>
                        </button>
                      )}
                    </For>
                  </div>
                  <div class="auth-card__meta">
                    Starter pipeline: transcript-ready meetings will generate reviewable notes with{" "}
                    {granolaAgentProviderLabel(props.preferredProvider)}.
                  </div>
                  <div class="auth-card__meta">{providerSetupHint(props.preferredProvider)}</div>
                  <button
                    class="button button--primary"
                    disabled={!props.state.synced}
                    onClick={props.onCreateStarterPipeline}
                    type="button"
                  >
                    Create starter pipeline
                  </button>
                </div>
              </Show>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}
