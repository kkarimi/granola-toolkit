import {
  type Component,
  type Focusable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

import type { GranolaAutomationActionRun } from "../app/index.ts";

import { granolaTuiTheme } from "./theme.ts";

interface GranolaTuiAutomationOverlayOptions {
  onApprove: (id: string) => Promise<void> | void;
  onCancel: () => void;
  onReject: (id: string) => Promise<void> | void;
  runs: GranolaAutomationActionRun[];
}

function padLine(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function frameLine(text: string, width: number): string {
  const innerWidth = Math.max(1, width - 4);
  return `| ${padLine(text, innerWidth)} |`;
}

function wrapDetails(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width - 4));
}

function statusLabel(run: GranolaAutomationActionRun): string {
  switch (run.status) {
    case "completed":
      return granolaTuiTheme.info(run.status);
    case "failed":
      return granolaTuiTheme.error(run.status);
    case "pending":
      return granolaTuiTheme.warning(run.status);
    case "skipped":
    default:
      return granolaTuiTheme.dim(run.status);
  }
}

export class GranolaTuiAutomationOverlay implements Component, Focusable {
  focused = false;
  #selectedIndex = 0;

  constructor(private readonly options: GranolaTuiAutomationOverlayOptions) {}

  invalidate(): void {}

  private get selected(): GranolaAutomationActionRun | undefined {
    return this.options.runs[this.#selectedIndex];
  }

  handleInput(data: string): void {
    if (matchesKey(data, "esc")) {
      this.options.onCancel();
      return;
    }

    if (matchesKey(data, "up")) {
      this.#selectedIndex = Math.max(0, this.#selectedIndex - 1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.#selectedIndex = Math.min(this.options.runs.length - 1, this.#selectedIndex + 1);
      return;
    }

    if (matchesKey(data, "enter") || matchesKey(data, "a")) {
      if (this.selected?.status === "pending") {
        void this.options.onApprove(this.selected.id);
      }
      return;
    }

    if (matchesKey(data, "r")) {
      if (this.selected?.status === "pending") {
        void this.options.onReject(this.selected.id);
      }
    }
  }

  render(width: number): string[] {
    const bodyWidth = Math.max(56, width);
    const innerWidth = Math.max(1, bodyWidth - 4);
    const maxRuns = 6;
    const lines: string[] = [];

    lines.push(`+${"-".repeat(bodyWidth - 2)}+`);
    lines.push(frameLine(granolaTuiTheme.strong("Automation Runs"), bodyWidth));
    lines.push(
      frameLine("Pending runs can be approved with Enter/a or rejected with r.", bodyWidth),
    );
    lines.push(frameLine("", bodyWidth));

    if (this.options.runs.length === 0) {
      lines.push(frameLine(granolaTuiTheme.dim("No automation runs yet."), bodyWidth));
    } else {
      for (const [index, run] of this.options.runs.slice(0, maxRuns).entries()) {
        const selected = index === this.#selectedIndex;
        const title = `${selected ? ">" : " "} ${run.actionName} · ${statusLabel(run)}`;
        lines.push(frameLine(selected ? granolaTuiTheme.selected(title) : title, bodyWidth));
        lines.push(frameLine(`  ${run.ruleName} · ${run.title}`, bodyWidth));

        const details = run.prompt || run.result || run.error || run.eventKind;
        for (const line of wrapDetails(`  ${details}`, innerWidth).slice(0, 2)) {
          lines.push(frameLine(line, bodyWidth));
        }

        lines.push(frameLine("", bodyWidth));
      }
    }

    lines.push(frameLine(granolaTuiTheme.dim("Esc close"), bodyWidth));
    lines.push(`+${"-".repeat(bodyWidth - 2)}+`);
    return lines;
  }
}
