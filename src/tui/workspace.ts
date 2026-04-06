import {
  type Component,
  matchesKey,
  type OverlayOptions,
  ProcessTerminal,
  TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type OverlayHandle,
} from "@mariozechner/pi-tui";

import type {
  FolderSummaryRecord,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAppApi,
  GranolaAppState,
  GranolaAppAuthState,
  GranolaAppStateEvent,
  GranolaMeetingBundle,
  GranolaProcessingIssue,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";

import { buildGranolaTuiSummary, renderGranolaTuiMeetingTab } from "./helpers.ts";
import { GranolaTuiAutomationOverlay } from "./automation.ts";
import { GranolaTuiAuthOverlay, type GranolaTuiAuthActionId } from "./auth.ts";
import { GranolaTuiQuickOpenPalette } from "./palette.ts";
import { granolaTuiTheme } from "./theme.ts";
import type { GranolaTuiWorkspaceTab } from "./types.ts";

export interface GranolaTuiHost {
  readonly terminal: {
    columns: number;
    rows: number;
  };
  requestRender(force?: boolean): void;
  setFocus(component: Component | null): void;
  showOverlay(component: Component, options?: OverlayOptions): OverlayHandle;
}

export interface GranolaTuiWorkspaceOptions {
  initialMeetingId?: string;
  maxMeetings?: number;
  onExit: () => void;
}

export interface GranolaTuiApp extends GranolaAppApi {
  close?: () => Promise<void> | void;
}

type GranolaTuiStatusTone = "error" | "info" | "warning";
type GranolaTuiFocusPane = "folders" | "meetings";

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

export class GranolaTuiWorkspace implements Component {
  focused = false;

  readonly #maxMeetings: number;

  #appState: GranolaAppState;
  #activePane: GranolaTuiFocusPane = "meetings";
  #automationArtefacts: GranolaAutomationArtefact[] = [];
  #processingIssues: GranolaProcessingIssue[] = [];
  #automationRuns: GranolaAutomationActionRun[] = [];
  #detailError = "";
  #detailScroll = 0;
  #detailToken = 0;
  #folderError = "";
  #folderToken = 0;
  #folders: FolderSummaryRecord[] = [];
  #listError = "";
  #listToken = 0;
  #loadingDetail = false;
  #loadingMeetings = false;
  #meetingSource: MeetingSummarySource = "live";
  #meetings: MeetingSummaryRecord[] = [];
  #overlay?: OverlayHandle;
  #recentMeetingIds: string[] = [];
  #selectedFolderId?: string;
  #selectedMeeting?: GranolaMeetingBundle;
  #selectedMeetingId?: string;
  #statusMessage = "Loading meetings…";
  #statusTone: GranolaTuiStatusTone = "info";
  #tab: GranolaTuiWorkspaceTab = "notes";
  #unsubscribe?: () => void;

  constructor(
    private readonly tui: GranolaTuiHost,
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

    await this.loadAutomationRuns();
    await this.loadAutomationArtefacts();
    await this.loadProcessingIssues();
    await this.loadFolders({
      setStatus: false,
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

    void this.loadAutomationRuns();
    void this.loadAutomationArtefacts();
    void this.loadProcessingIssues();

    if (
      this.#meetingSource === "index" &&
      event.state.documents.loadedAt &&
      event.state.documents.loadedAt !== previousDocumentsLoadedAt &&
      !this.#loadingMeetings
    ) {
      void (async () => {
        await this.loadFolders({ setStatus: false });
        await this.loadMeetings({
          preferredMeetingId: this.#selectedMeetingId,
        });
      })();
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

  private normaliseSelectedFolderIndex(): number {
    if (!this.#selectedFolderId) {
      return 0;
    }

    const selectedIndex = this.#folders.findIndex((folder) => folder.id === this.#selectedFolderId);
    return selectedIndex >= 0 ? selectedIndex + 1 : 0;
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

  private async loadFolders(
    options: {
      forceRefresh?: boolean;
      setStatus?: boolean;
    } = {},
  ): Promise<void> {
    const token = ++this.#folderToken;
    this.#folderError = "";
    if (options.setStatus) {
      this.setStatus(options.forceRefresh ? "Refreshing folders…" : "Loading folders…");
    }

    try {
      const result = await this.app.listFolders({
        forceRefresh: options.forceRefresh,
        limit: 100,
      });

      if (token !== this.#folderToken) {
        return;
      }

      this.#folders = [...result.folders];
      if (
        this.#selectedFolderId &&
        !this.#folders.some((folder) => folder.id === this.#selectedFolderId)
      ) {
        this.#selectedFolderId = undefined;
      }
      this.#folderError = "";
    } catch (error) {
      if (token !== this.#folderToken) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.#folderError = message;
      this.#folders = [];
      this.#selectedFolderId = undefined;
      this.setStatus(message, "error");
    } finally {
      if (token === this.#folderToken) {
        this.tui.requestRender();
      }
    }
  }

  private async loadAutomationRuns(): Promise<void> {
    try {
      const result = await this.app.listAutomationRuns({ limit: 20 });
      this.#automationRuns = [...result.runs];
      this.tui.requestRender();
    } catch {
      // Automation visibility should not break the rest of the workspace.
    }
  }

  private async loadAutomationArtefacts(): Promise<void> {
    try {
      const result = await this.app.listAutomationArtefacts({ limit: 20 });
      this.#automationArtefacts = [...result.artefacts];
      this.tui.requestRender();
    } catch {
      // Automation visibility should not break the rest of the workspace.
    }
  }

  private async loadProcessingIssues(): Promise<void> {
    try {
      const result = await this.app.listProcessingIssues({ limit: 20 });
      this.#processingIssues = [...result.issues];
      this.tui.requestRender();
    } catch {
      // Processing visibility should not break the rest of the workspace.
    }
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
        folderId: this.#selectedFolderId,
        forceRefresh: options.forceRefresh,
        limit: this.#maxMeetings,
        preferIndex: true,
      });

      if (token !== this.#listToken) {
        return;
      }

      this.#meetings = [...result.meetings];
      this.#meetingSource = result.source;
      let nextSelectedMeetingId: string | undefined;
      if (
        options.preferredMeetingId &&
        this.#meetings.some((meeting) => meeting.id === options.preferredMeetingId)
      ) {
        nextSelectedMeetingId = options.preferredMeetingId;
      } else if (
        this.#selectedMeetingId &&
        this.#meetings.some((meeting) => meeting.id === this.#selectedMeetingId)
      ) {
        nextSelectedMeetingId = this.#selectedMeetingId;
      } else {
        nextSelectedMeetingId = this.#meetings[0]?.id;
      }
      this.#selectedMeetingId = nextSelectedMeetingId;
      if (!this.#selectedMeetingId) {
        this.#selectedMeeting = undefined;
        this.#detailError = "";
        this.#detailScroll = 0;
      }
      this.#listError = "";
      this.setStatus(
        result.source === "index"
          ? "Loaded meetings from the local index"
          : this.#selectedFolderId
            ? "Connected to Granola (folder scope)"
            : "Connected to Granola",
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
      this.#recentMeetingIds = [
        bundle.document.id,
        ...this.#recentMeetingIds.filter((candidate) => candidate !== bundle.document.id),
      ].slice(0, 5);
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
      if (forceRefresh) {
        this.setStatus("Syncing…");
        await this.app.sync();
      }

      await this.loadFolders({
        forceRefresh,
        setStatus: false,
      });
      await this.loadMeetings({
        forceRefresh,
        preferredMeetingId: this.#selectedMeetingId,
      });

      if (this.#selectedMeetingId) {
        await this.loadMeeting(this.#selectedMeetingId, {
          ensureMeetingVisible: true,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message) {
        this.setStatus(error.message, "error");
      }
    }
  }

  private async moveMeetingSelection(delta: number): Promise<void> {
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

  private async moveFolderSelection(delta: number): Promise<void> {
    const total = this.#folders.length + 1;
    const currentIndex = this.normaliseSelectedFolderIndex();
    const nextIndex = Math.max(0, Math.min(total - 1, currentIndex + delta));
    const nextFolderId = nextIndex === 0 ? undefined : this.#folders[nextIndex - 1]?.id;

    if (nextFolderId === this.#selectedFolderId) {
      return;
    }

    this.#selectedFolderId = nextFolderId;
    this.#selectedMeeting = undefined;
    this.#detailError = "";
    this.#detailScroll = 0;
    this.#selectedMeetingId = undefined;
    await this.loadMeetings({
      setStatus: false,
    });

    const visibleMeetingId =
      this.#selectedMeetingId &&
      this.#meetings.some((meeting) => meeting.id === this.#selectedMeetingId)
        ? this.#selectedMeetingId
        : this.#meetings[0]?.id;

    if (visibleMeetingId) {
      this.#selectedMeetingId = visibleMeetingId;
      await this.loadMeeting(visibleMeetingId, {
        ensureMeetingVisible: true,
      });
      return;
    }

    this.#selectedMeetingId = undefined;
    this.tui.requestRender();
  }

  private async moveSelection(delta: number): Promise<void> {
    if (this.#activePane === "folders") {
      await this.moveFolderSelection(delta);
      return;
    }

    await this.moveMeetingSelection(delta);
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

  private async reloadAfterAuthChange(): Promise<void> {
    const preferredMeetingId = this.#selectedMeeting?.document.id ?? this.#selectedMeetingId;

    try {
      await this.loadFolders({
        forceRefresh: true,
        setStatus: false,
      });
      await this.loadMeetings({
        forceRefresh: true,
        preferredMeetingId,
        setStatus: false,
      });

      if (this.#selectedMeetingId) {
        await this.loadMeeting(this.#selectedMeetingId, {
          ensureMeetingVisible: true,
        });
        return;
      }

      this.#selectedMeeting = undefined;
      this.#detailError = "";
      this.#detailScroll = 0;
      this.tui.requestRender();
    } catch {
      // Status is already updated by the loaders.
    }
  }

  private async runAuthAction(actionId: GranolaTuiAuthActionId): Promise<void> {
    let successMessage = "";

    try {
      switch (actionId) {
        case "login":
          this.setStatus("Importing desktop session…");
          await this.app.loginAuth();
          successMessage = "Stored session imported";
          break;
        case "refresh":
          this.setStatus("Refreshing stored session…");
          await this.app.refreshAuth();
          successMessage = "Stored session refreshed";
          break;
        case "use-api-key":
          this.setStatus("Switching to stored API key…");
          await this.app.switchAuthMode("api-key");
          successMessage = "Using stored API key";
          break;
        case "use-stored":
          this.setStatus("Switching to stored session…");
          await this.app.switchAuthMode("stored-session");
          successMessage = "Using stored session";
          break;
        case "use-supabase":
          this.setStatus("Switching to supabase.json…");
          await this.app.switchAuthMode("supabase-file");
          successMessage = "Using supabase.json";
          break;
        case "logout":
          this.setStatus("Signing out…");
          await this.app.logoutAuth();
          successMessage = "Stored credentials removed";
          break;
      }

      await this.reloadAfterAuthChange();
      this.setStatus(successMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
    }
  }

  private openAuthPanel(auth: GranolaAppAuthState = this.#appState.auth): void {
    if (this.#overlay) {
      return;
    }

    const closeOverlay = () => {
      this.#overlay?.hide();
      this.#overlay = undefined;
      this.tui.setFocus(this);
      this.tui.requestRender();
    };

    const overlay = new GranolaTuiAuthOverlay({
      auth,
      onCancel: closeOverlay,
      onRun: async (actionId) => {
        closeOverlay();
        await this.runAuthAction(actionId);
      },
    });

    this.#overlay = this.tui.showOverlay(overlay, {
      anchor: "center",
      maxHeight: "70%",
      minWidth: 52,
      width: "72%",
    });
    this.setStatus("Auth session");
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
      onAction: async (actionId) => {
        closeOverlay();
        await this.runQuickOpenAction(actionId);
      },
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
      recentMeetingIds: this.#recentMeetingIds,
    });

    this.#overlay = this.tui.showOverlay(palette, {
      anchor: "center",
      maxHeight: "60%",
      minWidth: 48,
      width: "70%",
    });
    this.setStatus("Quick open");
  }

  private async runQuickOpenAction(actionId: "auth" | "automation" | "clear-scope" | "sync") {
    switch (actionId) {
      case "auth":
        this.openAuthPanel();
        return;
      case "automation":
        this.openAutomationPanel();
        return;
      case "clear-scope":
        this.#selectedFolderId = undefined;
        this.#selectedMeeting = undefined;
        this.#detailError = "";
        this.#detailScroll = 0;
        this.#selectedMeetingId = undefined;
        await this.loadMeetings({
          preferredMeetingId: this.#recentMeetingIds[0],
          setStatus: false,
        });
        if (this.#selectedMeetingId) {
          await this.loadMeeting(this.#selectedMeetingId, {
            ensureMeetingVisible: true,
          });
        }
        this.setStatus("Showing all meetings");
        return;
      case "sync":
      default:
        await this.refresh(true);
    }
  }

  private openAutomationPanel(): void {
    if (this.#overlay) {
      return;
    }

    const closeOverlay = () => {
      this.#overlay?.hide();
      this.#overlay = undefined;
      this.tui.setFocus(this);
      this.tui.requestRender();
    };

    const overlay = new GranolaTuiAutomationOverlay({
      artefacts: this.#automationArtefacts,
      issues: this.#processingIssues,
      onApproveArtefact: async (id) => {
        closeOverlay();
        await this.app.resolveAutomationArtefact(id, "approve");
        await this.loadAutomationArtefacts();
        this.setStatus("Artefact approved");
      },
      onApproveRun: async (id) => {
        closeOverlay();
        await this.app.resolveAutomationRun(id, "approve");
        await this.loadAutomationRuns();
        this.setStatus("Automation approved");
      },
      onCancel: closeOverlay,
      onRejectArtefact: async (id) => {
        closeOverlay();
        await this.app.resolveAutomationArtefact(id, "reject");
        await this.loadAutomationArtefacts();
        this.setStatus("Artefact rejected");
      },
      onRejectRun: async (id) => {
        closeOverlay();
        await this.app.resolveAutomationRun(id, "reject");
        await this.loadAutomationRuns();
        this.setStatus("Automation rejected");
      },
      onRecoverIssue: async (id) => {
        closeOverlay();
        const result = await this.app.recoverProcessingIssue(id);
        await this.loadProcessingIssues();
        await this.loadAutomationArtefacts();
        await this.loadAutomationRuns();
        this.setStatus(
          result.runCount > 0
            ? `Recovered ${result.issue.kind} and re-ran ${result.runCount} pipeline${result.runCount === 1 ? "" : "s"}`
            : `Recovered ${result.issue.kind}`,
        );
      },
      onRerunArtefact: async (id) => {
        closeOverlay();
        await this.app.rerunAutomationArtefact(id);
        await this.loadAutomationArtefacts();
        await this.loadAutomationRuns();
        this.setStatus("Artefact rerun complete");
      },
      runs: this.#automationRuns,
    });

    this.#overlay = this.tui.showOverlay(overlay, {
      anchor: "center",
      maxHeight: "70%",
      minWidth: 56,
      width: "76%",
    });
    this.setStatus("Review inbox");
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

    if (matchesKey(data, "a")) {
      this.openAuthPanel();
      return;
    }

    if (matchesKey(data, "u")) {
      this.openAutomationPanel();
      return;
    }

    if (matchesKey(data, "tab")) {
      this.#activePane = this.#activePane === "folders" ? "meetings" : "folders";
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "left") || matchesKey(data, "h")) {
      this.#activePane = "folders";
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "right") || matchesKey(data, "l")) {
      this.#activePane = "meetings";
      this.tui.requestRender();
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
    const recentMeetings = this.#recentMeetingIds
      .map((meetingId) => this.#meetings.find((meeting) => meeting.id === meetingId))
      .filter((meeting): meeting is MeetingSummaryRecord => meeting !== undefined);
    const folderEntries = [
      {
        id: undefined,
        label: "All meetings",
        meta: this.#folders.length > 0 ? `${this.#folders.length} folders` : "global scope",
      },
      ...this.#folders.map((folder) => ({
        id: folder.id,
        label: `${folder.isFavourite ? "★ " : ""}${folder.name || folder.id}`,
        meta: `${folder.documentCount} meetings`,
      })),
    ];
    const availableRows = Math.max(2, height - 3);
    const folderWindowSize = Math.min(
      Math.max(3, Math.min(8, Math.floor(availableRows * 0.35))),
      Math.max(1, availableRows - 1),
    );
    const recentWindowSize =
      recentMeetings.length > 0 ? Math.min(Math.max(2, recentMeetings.length), 3) : 0;
    const meetingWindowSize = Math.max(1, availableRows - folderWindowSize - recentWindowSize);

    const folderHeader = `${
      this.#activePane === "folders"
        ? granolaTuiTheme.accent("Folders")
        : granolaTuiTheme.strong("Folders")
    } ${granolaTuiTheme.dim(`(${this.#folders.length})`)}`;
    lines.push(padLine(folderHeader, innerWidth));

    if (this.#folderError) {
      lines.push(
        ...wrapBlock(granolaTuiTheme.error(this.#folderError), innerWidth).slice(
          0,
          folderWindowSize,
        ),
      );
      while (lines.length < 1 + folderWindowSize) {
        lines.push(" ".repeat(innerWidth));
      }
    } else {
      const selectedFolderIndex = this.normaliseSelectedFolderIndex();
      const folderStartIndex = Math.max(
        0,
        Math.min(
          selectedFolderIndex - Math.floor(folderWindowSize / 2),
          folderEntries.length - folderWindowSize,
        ),
      );
      const visibleFolders = folderEntries.slice(
        folderStartIndex,
        folderStartIndex + folderWindowSize,
      );

      for (const [offset, folder] of visibleFolders.entries()) {
        const actualIndex = folderStartIndex + offset;
        const selected = actualIndex === selectedFolderIndex;
        const prefix = selected ? "> " : "  ";
        const maxLabelWidth = Math.max(
          6,
          innerWidth - visibleWidth(prefix) - visibleWidth(folder.meta) - 1,
        );
        const label = truncateToWidth(folder.label, maxLabelWidth, "");
        const labelBlock = `${prefix}${label}`;
        const gap = " ".repeat(
          Math.max(1, innerWidth - visibleWidth(labelBlock) - visibleWidth(folder.meta)),
        );
        const line = `${labelBlock}${gap}${granolaTuiTheme.dim(folder.meta)}`;
        lines.push(
          selected
            ? padLine(granolaTuiTheme.selected(line), innerWidth)
            : padLine(line, innerWidth),
        );
      }

      while (lines.length < 1 + folderWindowSize) {
        lines.push(" ".repeat(innerWidth));
      }
    }

    lines.push(padLine(granolaTuiTheme.dim(""), innerWidth));

    if (recentWindowSize > 0) {
      lines.push(padLine(granolaTuiTheme.strong("Recent"), innerWidth));
      for (const meeting of recentMeetings.slice(0, recentWindowSize)) {
        const prefix = meeting.id === this.#selectedMeetingId ? "> " : "  ";
        const dateLabel = meeting.updatedAt.slice(0, 10);
        const maxTitleWidth = Math.max(6, innerWidth - visibleWidth(prefix) - dateLabel.length - 1);
        const title = truncateToWidth(meeting.title || meeting.id, maxTitleWidth, "");
        const titleBlock = `${prefix}${title}`;
        const gap = " ".repeat(
          Math.max(1, innerWidth - visibleWidth(titleBlock) - visibleWidth(dateLabel)),
        );
        lines.push(padLine(`${titleBlock}${gap}${granolaTuiTheme.dim(dateLabel)}`, innerWidth));
      }
      lines.push(padLine(granolaTuiTheme.dim(""), innerWidth));
    }

    const meetingsHeader = `${
      this.#activePane === "meetings"
        ? granolaTuiTheme.accent("Meetings")
        : granolaTuiTheme.strong("Meetings")
    } ${granolaTuiTheme.dim(`(${this.#meetings.length})`)}`;
    lines.push(padLine(meetingsHeader, innerWidth));

    if (this.#listError) {
      lines.push(
        ...wrapBlock(granolaTuiTheme.error(this.#listError), innerWidth).slice(
          0,
          meetingWindowSize,
        ),
      );
      while (lines.length < height) {
        lines.push(" ".repeat(innerWidth));
      }
      return lines;
    }

    if (this.#meetings.length === 0) {
      const emptyMessage = this.#appState.auth.lastError
        ? "Auth needs attention. Press a to fix credentials."
        : this.#appState.sync.lastCompletedAt
          ? "No meetings in this scope. Press / to quick open or Tab to change panes."
          : "No meetings yet. Press r to sync, or a to configure auth.";
      lines.push(...wrapBlock(emptyMessage, innerWidth).slice(0, meetingWindowSize));
      while (lines.length < height) {
        lines.push(" ".repeat(innerWidth));
      }
      return lines;
    }

    const selectedIndex = this.normaliseSelectedIndex();
    const startIndex = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor(meetingWindowSize / 2),
        this.#meetings.length - meetingWindowSize,
      ),
    );
    const visibleMeetings = this.#meetings.slice(startIndex, startIndex + meetingWindowSize);

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
      granolaTuiTheme.dim(
        "h/l or Tab pane  j/k move  / palette  a auth  u automation  r sync  1-4 tabs  PgUp/PgDn scroll  q quit",
      ),
      width,
    );

    return [headerTitle, headerSummary, ...bodyLines, footerStatus, footerHints];
  }
}

export async function runGranolaTui(
  app: GranolaTuiApp,
  options: {
    initialMeetingId?: string;
    onClose?: () => Promise<void> | void;
  } = {},
): Promise<number> {
  const tui = new TUI(new ProcessTerminal());

  return await new Promise<number>((resolve, reject) => {
    const workspace = new GranolaTuiWorkspace(tui, app, {
      initialMeetingId: options.initialMeetingId,
      onExit: () => {
        workspace.dispose();
        tui.stop();
        Promise.resolve(options.onClose?.())
          .then(() => Promise.resolve(app.close?.()))
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
        await Promise.resolve(options.onClose?.())
          .then(() => Promise.resolve(app.close?.()))
          .catch(() => {
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
