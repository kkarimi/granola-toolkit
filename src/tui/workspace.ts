import {
  type Component,
  matchesKey,
  ProcessTerminal,
  TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type OverlayHandle,
} from "@mariozechner/pi-tui";

import type {
  GranolaAppApi,
  GranolaAppState,
  GranolaAppStateEvent,
  GranolaMeetingBundle,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";

import { buildGranolaTuiSummary, renderGranolaTuiMeetingTab } from "./helpers.ts";
import { GranolaTuiQuickOpenPalette } from "./palette.ts";
import { granolaTuiTheme } from "./theme.ts";
import type { GranolaTuiWorkspaceTab } from "./types.ts";

interface GranolaTuiWorkspaceOptions {
  initialMeetingId?: string;
  maxMeetings?: number;
  onExit: () => void;
}

interface GranolaTuiApp extends GranolaAppApi {
  close?: () => Promise<void> | void;
}

type GranolaTuiStatusTone = "error" | "info" | "warning";

function padLine(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function wrapBlock(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const wrapped = wrapTextWithAnsi(line, Math.max(1, width));
    if (wrapped.length === 0) {
      lines.push("");
      continue;
    }
    lines.push(...wrapped);
  }
  return lines;
}

function toneText(tone: GranolaTuiStatusTone, text: string): string {
  switch (tone) {
    case "error":
      return granolaTuiTheme.error(text);
    case "warning":
      return granolaTuiTheme.warning(text);
    case "info":
    default:
      return granolaTuiTheme.info(text);
  }
}

class GranolaTuiWorkspace implements Component {
  focused = false;

  readonly #maxMeetings: number;

  #appState: GranolaAppState;
  #detailError = "";
  #detailScroll = 0;
  #detailToken = 0;
  #listError = "";
  #listToken = 0;
  #loadingDetail = false;
  #loadingMeetings = false;
  #meetingSource: MeetingSummarySource = "live";
  #meetings: MeetingSummaryRecord[] = [];
  #overlay?: OverlayHandle;
  #selectedMeeting?: GranolaMeetingBundle;
  #selectedMeetingId?: string;
  #statusMessage = "Loading meetings…";
  #statusTone: GranolaTuiStatusTone = "info";
  #tab: GranolaTuiWorkspaceTab = "notes";
  #unsubscribe?: () => void;

  constructor(
    private readonly tui: TUI,
    private readonly app: GranolaTuiApp,
    private readonly options: GranolaTuiWorkspaceOptions,
  ) {
    this.#appState = app.getState();
    this.#maxMeetings = options.maxMeetings ?? 200;
  }

  async initialise(): Promise<void> {
    this.#unsubscribe = this.app.subscribe((event) => {
      this.handleAppUpdate(event);
    });

    await this.loadMeetings({
      preferredMeetingId: this.options.initialMeetingId,
      setStatus: true,
    });

    if (this.options.initialMeetingId) {
      await this.loadMeeting(this.options.initialMeetingId, {
        ensureMeetingVisible: true,
      });
    } else if (this.#selectedMeetingId) {
      void this.loadMeeting(this.#selectedMeetingId);
    }
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  invalidate(): void {}

  private handleAppUpdate(event: GranolaAppStateEvent): void {
    const previousDocumentsLoadedAt = this.#appState.documents.loadedAt;
    this.#appState = event.state;

    if (
      this.#meetingSource === "index" &&
      event.state.documents.loadedAt &&
      event.state.documents.loadedAt !== previousDocumentsLoadedAt &&
      !this.#loadingMeetings
    ) {
      void this.loadMeetings({
        preferredMeetingId: this.#selectedMeetingId,
      });
    }

    this.tui.requestRender();
  }

  private setStatus(message: string, tone: GranolaTuiStatusTone = "info"): void {
    this.#statusMessage = message;
    this.#statusTone = tone;
    this.tui.requestRender();
  }

  private normaliseSelectedIndex(): number {
    if (this.#meetings.length === 0) {
      return -1;
    }

    const selectedIndex = this.#selectedMeetingId
      ? this.#meetings.findIndex((meeting) => meeting.id === this.#selectedMeetingId)
      : -1;

    return selectedIndex >= 0 ? selectedIndex : 0;
  }

  private ensureMeetingVisible(meeting: MeetingSummaryRecord): void {
    const existingIndex = this.#meetings.findIndex((item) => item.id === meeting.id);
    if (existingIndex >= 0) {
      this.#meetings[existingIndex] = meeting;
    } else {
      this.#meetings.push(meeting);
    }

    this.#meetings.sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }

      return left.title.localeCompare(right.title);
    });
  }

  private async loadMeetings(
    options: {
      forceRefresh?: boolean;
      preferredMeetingId?: string;
      setStatus?: boolean;
    } = {},
  ): Promise<void> {
    const token = ++this.#listToken;
    this.#loadingMeetings = true;
    this.#listError = "";
    if (options.setStatus !== false) {
      this.setStatus(options.forceRefresh ? "Refreshing meetings…" : "Loading meetings…");
    }

    try {
      const result = await this.app.listMeetings({
        forceRefresh: options.forceRefresh,
        limit: this.#maxMeetings,
        preferIndex: true,
      });

      if (token !== this.#listToken) {
        return;
      }

      this.#meetings = result.meetings;
      this.#meetingSource = result.source;
      this.#selectedMeetingId =
        options.preferredMeetingId &&
        this.#meetings.some((meeting) => meeting.id === options.preferredMeetingId)
          ? options.preferredMeetingId
          : this.#selectedMeetingId &&
              this.#meetings.some((meeting) => meeting.id === this.#selectedMeetingId)
            ? this.#selectedMeetingId
            : this.#meetings[0]?.id;
      this.#listError = "";
      this.setStatus(
        result.source === "index" ? "Loaded meetings from the local index" : "Connected to Granola",
      );
    } catch (error) {
      if (token !== this.#listToken) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.#listError = message;
      this.setStatus(message, "error");
      throw error;
    } finally {
      if (token === this.#listToken) {
        this.#loadingMeetings = false;
        this.tui.requestRender();
      }
    }
  }

  private async loadMeeting(
    meetingId: string,
    options: { ensureMeetingVisible?: boolean; resolveQuery?: boolean } = {},
  ): Promise<void> {
    const token = ++this.#detailToken;
    this.#loadingDetail = true;
    this.#detailError = "";
    this.#selectedMeetingId = meetingId;
    this.#detailScroll = 0;
    this.setStatus(`Opening ${meetingId}…`);

    try {
      const bundle = options.resolveQuery
        ? await this.app.findMeeting(meetingId)
        : await this.app.getMeeting(meetingId);
      if (token !== this.#detailToken) {
        return;
      }

      this.#selectedMeeting = bundle;
      this.#selectedMeetingId = bundle.document.id;
      if (options.ensureMeetingVisible) {
        this.ensureMeetingVisible(bundle.meeting.meeting);
      }
      this.setStatus(`Opened ${bundle.meeting.meeting.title || bundle.meeting.meeting.id}`);
    } catch (error) {
      if (token !== this.#detailToken) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.#selectedMeeting = undefined;
      this.#detailError = message;
      this.setStatus(message, "error");
    } finally {
      if (token === this.#detailToken) {
        this.#loadingDetail = false;
        this.tui.requestRender();
      }
    }
  }

  private async refresh(forceRefresh: boolean): Promise<void> {
    try {
      await this.loadMeetings({
        forceRefresh,
        preferredMeetingId: this.#selectedMeetingId,
      });

      if (this.#selectedMeetingId) {
        await this.loadMeeting(this.#selectedMeetingId, {
          ensureMeetingVisible: true,
        });
      }
    } catch {
      // Status is already updated by the underlying loaders.
    }
  }

  private async moveSelection(delta: number): Promise<void> {
    if (this.#meetings.length === 0) {
      return;
    }

    const currentIndex = this.normaliseSelectedIndex();
    const nextIndex = Math.max(0, Math.min(this.#meetings.length - 1, currentIndex + delta));
    const nextMeeting = this.#meetings[nextIndex];
    if (!nextMeeting || nextMeeting.id === this.#selectedMeetingId) {
      return;
    }

    await this.loadMeeting(nextMeeting.id);
  }

  private currentDetailBody(width: number): string[] {
    if (this.#detailError) {
      return wrapBlock(this.#detailError, width);
    }

    if (this.#loadingDetail && !this.#selectedMeeting) {
      return wrapBlock("Loading meeting details…", width);
    }

    if (!this.#selectedMeeting) {
      return wrapBlock("Select a meeting to inspect its notes, transcript, and metadata.", width);
    }

    return wrapBlock(renderGranolaTuiMeetingTab(this.#selectedMeeting, this.#tab), width);
  }

  private detailScrollStep(width: number, height: number): number {
    const bodyHeight = Math.max(1, height - 2);
    const totalLines = this.currentDetailBody(width).length;
    if (totalLines <= bodyHeight) {
      return 0;
    }

    return Math.max(1, Math.min(bodyHeight - 1, totalLines - bodyHeight));
  }

  private scrollDetail(delta: number): void {
    const totalWidth = this.tui.terminal.columns;
    const totalHeight = this.tui.terminal.rows;
    const { detailWidth } = this.resolveLayout(totalWidth);
    const bodyHeight = Math.max(1, totalHeight - 6);
    const detailLines = this.currentDetailBody(Math.max(1, detailWidth - 2));
    const visibleBodyLines = Math.max(1, bodyHeight - 2);
    const maxScroll = Math.max(0, detailLines.length - visibleBodyLines);

    this.#detailScroll = Math.max(0, Math.min(maxScroll, this.#detailScroll + delta));
    this.tui.requestRender();
  }

  private cycleTab(delta: number): void {
    const tabs: GranolaTuiWorkspaceTab[] = ["notes", "transcript", "metadata", "raw"];
    const index = tabs.indexOf(this.#tab);
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    this.#tab = tabs[nextIndex] ?? "notes";
    this.#detailScroll = 0;
    this.tui.requestRender();
  }

  private openQuickOpen(): void {
    if (this.#overlay) {
      return;
    }

    const closeOverlay = () => {
      this.#overlay?.hide();
      this.#overlay = undefined;
      this.tui.setFocus(this);
      this.tui.requestRender();
    };

    const palette = new GranolaTuiQuickOpenPalette({
      meetings: this.#meetings,
      onCancel: closeOverlay,
      onPick: async (meetingId) => {
        closeOverlay();
        await this.loadMeeting(meetingId, {
          ensureMeetingVisible: true,
        });
      },
      onResolveQuery: async (query) => {
        closeOverlay();
        await this.loadMeeting(query, {
          ensureMeetingVisible: true,
          resolveQuery: true,
        });
      },
    });

    this.#overlay = this.tui.showOverlay(palette, {
      anchor: "center",
      maxHeight: "60%",
      minWidth: 48,
      width: "70%",
    });
    this.setStatus("Quick open");
  }

  handleInput(data: string): void {
    if (matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.options.onExit();
      return;
    }

    if (matchesKey(data, "r")) {
      void this.refresh(true);
      return;
    }

    if (matchesKey(data, "/") || matchesKey(data, "ctrl+p")) {
      this.openQuickOpen();
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      void this.moveSelection(-1);
      return;
    }

    if (matchesKey(data, "down") || matchesKey(data, "j")) {
      void this.moveSelection(1);
      return;
    }

    if (matchesKey(data, "pageUp")) {
      this.scrollDetail(
        -Math.max(1, this.detailScrollStep(this.tui.terminal.columns, this.tui.terminal.rows)),
      );
      return;
    }

    if (matchesKey(data, "pageDown")) {
      this.scrollDetail(this.detailScrollStep(this.tui.terminal.columns, this.tui.terminal.rows));
      return;
    }

    if (matchesKey(data, "1")) {
      this.#tab = "notes";
      this.#detailScroll = 0;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "2")) {
      this.#tab = "transcript";
      this.#detailScroll = 0;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "3")) {
      this.#tab = "metadata";
      this.#detailScroll = 0;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "4")) {
      this.#tab = "raw";
      this.#detailScroll = 0;
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "]")) {
      this.cycleTab(1);
      return;
    }

    if (matchesKey(data, "[")) {
      this.cycleTab(-1);
    }
  }

  private resolveLayout(width: number): { detailWidth: number; listWidth: number } {
    const minimumDetailWidth = 24;
    const minimumListWidth = 24;
    const available = Math.max(1, width - 3);
    let listWidth = Math.max(minimumListWidth, Math.min(42, Math.floor(available * 0.34)));
    let detailWidth = available - listWidth;

    if (detailWidth < minimumDetailWidth) {
      detailWidth = minimumDetailWidth;
      listWidth = Math.max(minimumListWidth, available - detailWidth);
    }

    if (listWidth + detailWidth > available) {
      detailWidth = Math.max(minimumDetailWidth, available - listWidth);
    }

    return {
      detailWidth,
      listWidth,
    };
  }

  private renderListPane(width: number, height: number): string[] {
    const lines: string[] = [];
    const innerWidth = Math.max(1, width - 2);
    const header = `${granolaTuiTheme.strong("Meetings")} ${granolaTuiTheme.dim(`(${this.#meetings.length})`)}`;
    lines.push(padLine(header, innerWidth));

    if (this.#listError) {
      lines.push(
        ...wrapBlock(granolaTuiTheme.error(this.#listError), innerWidth).slice(0, height - 1),
      );
      while (lines.length < height) {
        lines.push(" ".repeat(innerWidth));
      }
      return lines;
    }

    if (this.#meetings.length === 0) {
      lines.push(...wrapBlock("No meetings available yet.", innerWidth).slice(0, height - 1));
      while (lines.length < height) {
        lines.push(" ".repeat(innerWidth));
      }
      return lines;
    }

    const selectedIndex = this.normaliseSelectedIndex();
    const windowSize = Math.max(1, height - 1);
    const startIndex = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(windowSize / 2), this.#meetings.length - windowSize),
    );
    const visibleMeetings = this.#meetings.slice(startIndex, startIndex + windowSize);

    for (const [offset, meeting] of visibleMeetings.entries()) {
      const actualIndex = startIndex + offset;
      const selected = actualIndex === selectedIndex;
      const dateLabel = meeting.updatedAt.slice(0, 10);
      const prefix = selected ? "> " : "  ";
      const maxTitleWidth = Math.max(6, innerWidth - visibleWidth(prefix) - dateLabel.length - 1);
      const title = truncateToWidth(meeting.title || meeting.id, maxTitleWidth, "");
      const titleBlock = `${prefix}${title}`;
      const gap = " ".repeat(
        Math.max(1, innerWidth - visibleWidth(titleBlock) - visibleWidth(dateLabel)),
      );
      const line = `${titleBlock}${gap}${granolaTuiTheme.dim(dateLabel)}`;
      lines.push(
        selected ? padLine(granolaTuiTheme.selected(line), innerWidth) : padLine(line, innerWidth),
      );
    }

    while (lines.length < height) {
      lines.push(" ".repeat(innerWidth));
    }

    return lines;
  }

  private renderDetailPane(width: number, height: number): string[] {
    const lines: string[] = [];
    const innerWidth = Math.max(1, width - 2);
    const tabs: Array<{ id: GranolaTuiWorkspaceTab; label: string }> = [
      { id: "notes", label: "1 Notes" },
      { id: "transcript", label: "2 Transcript" },
      { id: "metadata", label: "3 Metadata" },
      { id: "raw", label: "4 Raw" },
    ];

    const title =
      this.#selectedMeeting?.meeting.meeting.title || this.#selectedMeetingId || "Meeting";
    const titleLine = `${granolaTuiTheme.strong(title)} ${granolaTuiTheme.dim(
      this.#selectedMeeting ? this.#selectedMeeting.meeting.meeting.id : "",
    )}`.trim();
    lines.push(padLine(titleLine, innerWidth));

    const tabLine = tabs
      .map((tab) =>
        tab.id === this.#tab ? granolaTuiTheme.selected(` ${tab.label} `) : ` ${tab.label} `,
      )
      .join(" ");
    lines.push(padLine(tabLine, innerWidth));

    const bodyLines = this.currentDetailBody(innerWidth);
    const bodyHeight = Math.max(1, height - 2);
    const visibleBody = bodyLines.slice(this.#detailScroll, this.#detailScroll + bodyHeight);

    lines.push(...visibleBody.map((line) => padLine(line, innerWidth)));
    while (lines.length < height) {
      lines.push(" ".repeat(innerWidth));
    }

    return lines;
  }

  render(width: number): string[] {
    const totalHeight = Math.max(12, this.tui.terminal.rows);
    const { detailWidth, listWidth } = this.resolveLayout(width);
    const headerHeight = 2;
    const footerHeight = 2;
    const bodyHeight = Math.max(6, totalHeight - headerHeight - footerHeight);
    const selectedLabel =
      this.#selectedMeeting?.meeting.meeting.title || this.#selectedMeetingId || "none";

    const headerTitle = padLine(
      `${granolaTuiTheme.accent("Granola Toolkit TUI")} ${granolaTuiTheme.dim(
        this.#loadingMeetings ? "loading…" : selectedLabel,
      )}`,
      width,
    );
    const headerSummary = padLine(
      granolaTuiTheme.dim(buildGranolaTuiSummary(this.#appState, this.#meetingSource)),
      width,
    );

    const listLines = this.renderListPane(listWidth, bodyHeight);
    const detailLines = this.renderDetailPane(detailWidth, bodyHeight);
    const bodyLines: string[] = [];

    for (let index = 0; index < bodyHeight; index += 1) {
      bodyLines.push(
        `${padLine(listLines[index] ?? "", listWidth)} | ${padLine(detailLines[index] ?? "", detailWidth)}`,
      );
    }

    const footerStatus = padLine(toneText(this.#statusTone, this.#statusMessage), width);
    const footerHints = padLine(
      granolaTuiTheme.dim("/ quick open  r refresh  1-4 tabs  PgUp/PgDn scroll  q quit"),
      width,
    );

    return [headerTitle, headerSummary, ...bodyLines, footerStatus, footerHints];
  }
}

export async function runGranolaTui(
  app: GranolaTuiApp,
  options: { initialMeetingId?: string } = {},
): Promise<number> {
  const tui = new TUI(new ProcessTerminal());

  return await new Promise<number>((resolve, reject) => {
    const workspace = new GranolaTuiWorkspace(tui, app, {
      initialMeetingId: options.initialMeetingId,
      onExit: () => {
        workspace.dispose();
        tui.stop();
        Promise.resolve(app.close?.())
          .catch(() => {
            // Best-effort shutdown for remote clients.
          })
          .finally(() => {
            resolve(0);
          });
      },
    });

    void (async () => {
      try {
        await workspace.initialise();
      } catch (error) {
        workspace.dispose();
        await Promise.resolve(app.close?.()).catch(() => {
          // Best-effort shutdown for remote clients.
        });
        reject(error);
        return;
      }

      tui.addChild(workspace);
      tui.setFocus(workspace);
      tui.start();
      tui.requestRender(true);
    })();
  });
}
