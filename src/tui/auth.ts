import {
  type Component,
  type Focusable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

import type { GranolaAppAuthState } from "../app/index.ts";
import { granolaAuthModeLabel, granolaAuthRecommendation } from "../auth-summary.ts";

import { granolaTuiTheme } from "./theme.ts";

export type GranolaTuiAuthActionId =
  | "login"
  | "logout"
  | "refresh"
  | "use-api-key"
  | "use-stored"
  | "use-supabase";

export interface GranolaTuiAuthAction {
  description: string;
  disabled: boolean;
  disabledReason?: string;
  id: GranolaTuiAuthActionId;
  key: string;
  label: string;
}

interface GranolaTuiAuthOverlayOptions {
  auth: GranolaAppAuthState;
  onCancel: () => void;
  onRun: (actionId: GranolaTuiAuthActionId) => Promise<void> | void;
}

function padLine(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function frameLine(text: string, width: number): string {
  const innerWidth = Math.max(1, width - 4);
  return `| ${padLine(text, innerWidth)} |`;
}

function actionDisabledReason(auth: GranolaAppAuthState, actionId: GranolaTuiAuthActionId): string {
  switch (actionId) {
    case "login":
      return auth.supabaseAvailable ? "" : "supabase.json unavailable";
    case "refresh":
      if (!auth.storedSessionAvailable) {
        return "stored session missing";
      }
      return auth.refreshAvailable ? "" : "refresh unavailable";
    case "use-api-key":
      if (!auth.apiKeyAvailable) {
        return "API key missing";
      }
      return auth.mode === "api-key" ? "already active" : "";
    case "use-stored":
      if (!auth.storedSessionAvailable) {
        return "stored session missing";
      }
      return auth.mode === "stored-session" ? "already active" : "";
    case "use-supabase":
      if (!auth.supabaseAvailable) {
        return "supabase.json unavailable";
      }
      return auth.mode === "supabase-file" ? "already active" : "";
    case "logout":
      return auth.apiKeyAvailable || auth.storedSessionAvailable ? "" : "no stored credentials";
  }
}

export function buildGranolaTuiAuthActions(auth: GranolaAppAuthState): GranolaTuiAuthAction[] {
  const actions: Array<{
    description: string;
    id: GranolaTuiAuthActionId;
    key: string;
    label: string;
  }> = [
    {
      description: "Import the Granola desktop session from supabase.json as a fallback",
      id: "login",
      key: "1",
      label: "Import desktop session fallback",
    },
    {
      description: "Refresh the stored Granola session",
      id: "refresh",
      key: "2",
      label: "Refresh stored session",
    },
    {
      description: "Switch the active auth source to the stored API key",
      id: "use-api-key",
      key: "3",
      label: "Use API key",
    },
    {
      description: "Switch the active auth source to the stored session",
      id: "use-stored",
      key: "4",
      label: "Use stored session",
    },
    {
      description: "Switch the active auth source to supabase.json",
      id: "use-supabase",
      key: "5",
      label: "Use supabase.json",
    },
    {
      description: "Delete stored credentials and fall back to configured sources",
      id: "logout",
      key: "6",
      label: "Sign out",
    },
  ];

  return actions.map((action) => {
    const disabledReason = actionDisabledReason(auth, action.id);
    return {
      ...action,
      disabled: disabledReason.length > 0,
      disabledReason: disabledReason || undefined,
    } satisfies GranolaTuiAuthAction;
  });
}

export function renderGranolaTuiAuthState(auth: GranolaAppAuthState): string {
  const recommendation = granolaAuthRecommendation(auth);
  const lines = [
    `Active source: ${granolaAuthModeLabel(auth.mode)}`,
    `Recommended: ${recommendation.status}`,
    `API key: ${auth.apiKeyAvailable ? "available" : "missing"}`,
    `Stored session: ${auth.storedSessionAvailable ? "available" : "missing"}`,
    `supabase.json: ${auth.supabaseAvailable ? "available" : "missing"}`,
    `Refresh: ${auth.refreshAvailable ? "available" : "missing"}`,
    `Guidance: ${recommendation.detail}`,
  ];

  if (recommendation.nextAction) {
    lines.push(`Next step: ${recommendation.nextAction}`);
  }

  if (auth.clientId) {
    lines.push(`Client ID: ${auth.clientId}`);
  }

  if (auth.signInMethod) {
    lines.push(`Sign-in method: ${auth.signInMethod}`);
  }

  if (auth.supabasePath) {
    lines.push(`supabase path: ${auth.supabasePath}`);
  }

  if (auth.lastError) {
    lines.push(`Last error: ${auth.lastError}`);
  }

  return lines.join("\n");
}

function nextEnabledIndex(
  actions: GranolaTuiAuthAction[],
  startIndex: number,
  delta: number,
): number {
  if (actions.length === 0) {
    return -1;
  }

  for (let attempts = 0; attempts < actions.length; attempts += 1) {
    const nextIndex = (startIndex + delta * (attempts + 1) + actions.length) % actions.length;
    if (!actions[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return Math.max(0, Math.min(actions.length - 1, startIndex));
}

export class GranolaTuiAuthOverlay implements Component, Focusable {
  focused = false;

  readonly #actions: GranolaTuiAuthAction[];
  #selectedIndex: number;

  constructor(private readonly options: GranolaTuiAuthOverlayOptions) {
    this.#actions = buildGranolaTuiAuthActions(this.options.auth);
    const firstEnabledIndex = this.#actions.findIndex((action) => !action.disabled);
    this.#selectedIndex = firstEnabledIndex >= 0 ? firstEnabledIndex : 0;
  }

  invalidate(): void {}

  private async runAction(actionId: GranolaTuiAuthActionId): Promise<void> {
    const action = this.#actions.find((candidate) => candidate.id === actionId);
    if (!action || action.disabled) {
      return;
    }

    await this.options.onRun(action.id);
  }

  handleInput(data: string): void {
    if (matchesKey(data, "esc")) {
      this.options.onCancel();
      return;
    }

    if (matchesKey(data, "up")) {
      this.#selectedIndex = nextEnabledIndex(this.#actions, this.#selectedIndex, -1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.#selectedIndex = nextEnabledIndex(this.#actions, this.#selectedIndex, 1);
      return;
    }

    const selected = this.#actions[this.#selectedIndex];
    if (matchesKey(data, "enter")) {
      if (selected && !selected.disabled) {
        void this.runAction(selected.id);
      }
      return;
    }

    const hotkeyAction = this.#actions.find((action) => action.key === data);
    if (hotkeyAction && !hotkeyAction.disabled) {
      void this.runAction(hotkeyAction.id);
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const bodyWidth = Math.max(48, width);

    lines.push(`+${"-".repeat(bodyWidth - 2)}+`);
    lines.push(frameLine(granolaTuiTheme.strong("Auth Session"), bodyWidth));
    lines.push(frameLine("", bodyWidth));

    for (const detailLine of renderGranolaTuiAuthState(this.options.auth).split("\n")) {
      lines.push(frameLine(detailLine, bodyWidth));
    }

    lines.push(frameLine("", bodyWidth));

    for (const action of this.#actions) {
      const selected = this.#actions[this.#selectedIndex]?.id === action.id;
      const label = `${action.key}. ${action.label}`;
      const titleLine = action.disabled
        ? granolaTuiTheme.dim(label)
        : selected
          ? granolaTuiTheme.selected(label)
          : label;
      lines.push(frameLine(titleLine, bodyWidth));

      const detail = action.disabled
        ? granolaTuiTheme.warning(action.disabledReason ?? "Unavailable")
        : granolaTuiTheme.dim(action.description);
      for (const wrapped of wrapTextWithAnsi(detail, Math.max(1, bodyWidth - 6))) {
        lines.push(frameLine(`  ${wrapped}`, bodyWidth));
      }
    }

    lines.push(frameLine("", bodyWidth));
    lines.push(
      frameLine(granolaTuiTheme.dim("Enter to run, Esc to cancel, arrows to move"), bodyWidth),
    );
    lines.push(`+${"-".repeat(bodyWidth - 2)}+`);
    return lines;
  }
}
