import {
  Input,
  type Component,
  type Focusable,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

import type { MeetingSummaryRecord } from "../app/index.ts";

import {
  buildGranolaTuiQuickOpenItems,
  type GranolaTuiQuickOpenActionId,
  type GranolaTuiQuickOpenItem,
} from "./helpers.ts";
import { granolaTuiTheme } from "./theme.ts";

interface GranolaTuiQuickOpenPaletteOptions {
  meetings: MeetingSummaryRecord[];
  onAction: (actionId: GranolaTuiQuickOpenActionId) => Promise<void> | void;
  onCancel: () => void;
  onPick: (meetingId: string) => Promise<void> | void;
  onResolveQuery: (query: string) => Promise<void> | void;
  recentMeetingIds?: string[];
}

function padLine(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function frameLine(text: string, width: number): string {
  const innerWidth = Math.max(1, width - 4);
  return `| ${padLine(text, innerWidth)} |`;
}

export class GranolaTuiQuickOpenPalette implements Component, Focusable {
  focused = false;

  readonly #input = new Input();

  #matches: GranolaTuiQuickOpenItem[];
  #selectedIndex = 0;

  constructor(private readonly options: GranolaTuiQuickOpenPaletteOptions) {
    this.#matches = buildGranolaTuiQuickOpenItems(this.options.meetings, "", {
      recentMeetingIds: this.options.recentMeetingIds,
    });
    this.#input.onEscape = () => {
      this.options.onCancel();
    };
    this.#input.onSubmit = () => {
      void this.chooseSelection();
    };
  }

  private get query(): string {
    return this.#input.getValue();
  }

  private updateMatches(): void {
    this.#matches = buildGranolaTuiQuickOpenItems(this.options.meetings, this.query, {
      recentMeetingIds: this.options.recentMeetingIds,
    });
    this.#selectedIndex = Math.max(0, Math.min(this.#selectedIndex, this.#matches.length - 1));
  }

  private async chooseSelection(): Promise<void> {
    const selected = this.#matches[this.#selectedIndex];
    if (selected) {
      if (selected.kind === "action" && selected.actionId) {
        await this.options.onAction(selected.actionId);
        return;
      }

      await this.options.onPick(selected.id);
      return;
    }

    if (this.query.trim()) {
      await this.options.onResolveQuery(this.query.trim());
      return;
    }

    this.options.onCancel();
  }

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, "up")) {
      this.#selectedIndex = Math.max(0, this.#selectedIndex - 1);
      return;
    }

    if (matchesKey(data, "down")) {
      this.#selectedIndex = Math.min(this.#matches.length - 1, this.#selectedIndex + 1);
      return;
    }

    if (matchesKey(data, "pageUp")) {
      this.#selectedIndex = Math.max(0, this.#selectedIndex - 5);
      return;
    }

    if (matchesKey(data, "pageDown")) {
      this.#selectedIndex = Math.min(this.#matches.length - 1, this.#selectedIndex + 5);
      return;
    }

    const before = this.query;
    this.#input.focused = this.focused;
    this.#input.handleInput(data);
    if (before !== this.query) {
      this.#selectedIndex = 0;
      this.updateMatches();
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const bodyWidth = Math.max(32, width);
    const visibleMatches = this.#matches.slice(0, 8);

    lines.push(`+${"-".repeat(bodyWidth - 2)}+`);
    lines.push(
      frameLine(
        granolaTuiTheme.strong("Quick Open") +
          granolaTuiTheme.dim("  meetings, recent items, or workspace actions"),
        bodyWidth,
      ),
    );
    lines.push(frameLine("", bodyWidth));

    for (const inputLine of this.#input.render(Math.max(1, bodyWidth - 4))) {
      lines.push(frameLine(inputLine, bodyWidth));
    }

    for (const hintLine of wrapTextWithAnsi(
      granolaTuiTheme.dim("Enter to open, Esc to cancel, arrows to move, type sync/auth/all"),
      Math.max(1, bodyWidth - 4),
    )) {
      lines.push(frameLine(hintLine, bodyWidth));
    }

    lines.push(frameLine("", bodyWidth));

    if (visibleMatches.length === 0) {
      lines.push(frameLine(granolaTuiTheme.warning("No matching meetings"), bodyWidth));
    } else {
      for (const [index, item] of visibleMatches.entries()) {
        const selected = index === this.#selectedIndex;
        const prefix = selected ? "> " : "  ";
        const title = `${prefix}${item.label}`;
        const titleLine = selected ? granolaTuiTheme.selected(title) : title;
        const detailLine = granolaTuiTheme.dim(`  ${item.description}`);
        lines.push(frameLine(titleLine, bodyWidth));
        lines.push(frameLine(detailLine, bodyWidth));
      }
    }

    lines.push(`+${"-".repeat(bodyWidth - 2)}+`);
    return lines;
  }
}
