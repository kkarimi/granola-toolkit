import {
  type Component,
  type OverlayOptions,
  ProcessTerminal,
  TUI,
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

import { GranolaTuiAutomationOverlay } from "./automation.ts";
import { GranolaTuiAuthOverlay, type GranolaTuiAuthActionId } from "./auth.ts";
import { GranolaTuiQuickOpenPalette } from "./palette.ts";
import { handleWorkspaceInput } from "./workspace-input.ts";
import {
  currentDetailBody,
  detailScrollStep,
  renderWorkspace,
  resolveWorkspaceLayout,
  type GranolaTuiWorkspaceViewModel,
} from "./workspace-render.ts";
import type { GranolaTuiFocusPane, GranolaTuiStatusTone, GranolaTuiWorkspaceTab } from "./types.ts";

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
    } else if (this.#selectedMeetingId && this.#appState.documents.loaded) {
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
          : result.source === "snapshot"
            ? "Loaded meetings from the local snapshot"
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
      this.#selectedMeetingId = bundle.source.document.id;
      this.#recentMeetingIds = [
        bundle.source.document.id,
        ...this.#recentMeetingIds.filter((candidate) => candidate !== bundle.source.document.id),
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

  private async openSelectedMeeting(): Promise<void> {
    if (!this.#selectedMeetingId) {
      return;
    }

    await this.loadMeeting(this.#selectedMeetingId, {
      ensureMeetingVisible: true,
    });
  }

  private viewModel(): GranolaTuiWorkspaceViewModel {
    return {
      activePane: this.#activePane,
      appState: this.#appState,
      detailError: this.#detailError,
      detailScroll: this.#detailScroll,
      folderError: this.#folderError,
      folders: this.#folders,
      listError: this.#listError,
      loadingDetail: this.#loadingDetail,
      loadingMeetings: this.#loadingMeetings,
      meetingSource: this.#meetingSource,
      meetings: this.#meetings,
      recentMeetingIds: this.#recentMeetingIds,
      selectedFolderId: this.#selectedFolderId,
      selectedMeeting: this.#selectedMeeting,
      selectedMeetingId: this.#selectedMeetingId,
      statusMessage: this.#statusMessage,
      statusTone: this.#statusTone,
      tab: this.#tab,
    };
  }

  private scrollStep(): number {
    const { detailWidth } = resolveWorkspaceLayout(this.tui.terminal.columns);
    return detailScrollStep(this.viewModel(), Math.max(1, detailWidth - 2), this.tui.terminal.rows);
  }

  private scrollDetail(delta: number): void {
    const totalWidth = this.tui.terminal.columns;
    const totalHeight = this.tui.terminal.rows;
    const { detailWidth } = resolveWorkspaceLayout(totalWidth);
    const bodyHeight = Math.max(1, totalHeight - 6);
    const detailLines = currentDetailBody(this.viewModel(), Math.max(1, detailWidth - 2));
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
    const preferredMeetingId = this.#selectedMeeting?.source.document.id ?? this.#selectedMeetingId;

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

  private async exportArchive(): Promise<void> {
    const folderId = this.#selectedFolderId;
    const scopeLabel = folderId
      ? this.#folders.find((folder) => folder.id === folderId)?.name || folderId
      : "all meetings";
    this.setStatus(`Exporting ${scopeLabel}…`);

    try {
      const notesResult = await this.app.exportNotes("markdown", {
        folderId,
        scopedOutput: true,
      });
      const transcriptsResult = await this.app.exportTranscripts("text", {
        folderId,
        scopedOutput: true,
      });
      this.setStatus(
        `Exported ${notesResult.documentCount} notes and ${transcriptsResult.transcriptCount} transcripts`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
    }
  }

  private async runQuickOpenAction(
    actionId: "auth" | "automation" | "clear-scope" | "export" | "sync",
  ) {
    switch (actionId) {
      case "auth":
        this.openAuthPanel();
        return;
      case "automation":
        this.openAutomationPanel();
        return;
      case "export":
        await this.exportArchive();
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
    handleWorkspaceInput(data, {
      activePane: this.#activePane,
      cycleTab: (delta) => {
        this.cycleTab(delta);
      },
      exportArchive: () => {
        void this.exportArchive();
      },
      exit: () => {
        this.options.onExit();
      },
      moveSelection: (delta) => {
        void this.moveSelection(delta);
      },
      openSelectedMeeting: () => {
        void this.openSelectedMeeting();
      },
      openAuth: () => {
        this.openAuthPanel();
      },
      openAutomation: () => {
        this.openAutomationPanel();
      },
      openQuickOpen: () => {
        this.openQuickOpen();
      },
      refresh: (forceRefresh) => {
        void this.refresh(forceRefresh);
      },
      requestRender: () => {
        this.tui.requestRender();
      },
      scrollDetail: (delta) => {
        this.scrollDetail(delta);
      },
      scrollStep: () => this.scrollStep(),
      selectTab: (tab) => {
        this.#tab = tab;
        this.#detailScroll = 0;
        this.tui.requestRender();
      },
      setActivePane: (pane) => {
        this.#activePane = pane;
      },
    });
  }

  render(width: number): string[] {
    return renderWorkspace(this.viewModel(), width, Math.max(12, this.tui.terminal.rows));
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
