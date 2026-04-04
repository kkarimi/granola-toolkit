/** @jsxImportSource solid-js */

import { createEffect, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";

import type {
  FolderSummaryRecord,
  GranolaAutomationActionRun,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppState,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  MeetingRecord,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";
import { createGranolaServerClient, type GranolaServerClient } from "../server/client.ts";
import {
  applyWorkspaceFilter,
  buildBrowserUrlPath,
  granolaWebWorkspaceStorageKey,
  parseWorkspacePreferences,
  rememberRecentMeeting,
  saveWorkspaceFilter,
  removeWorkspaceFilter,
  serialiseWorkspacePreferences,
  nextWorkspaceTab,
  parseWorkspaceTab,
  selectMeetingId,
  startupSelectionFromSearch,
  type WebWorkspacePreferences,
  type WorkspaceTab,
} from "../web/client-state.ts";
import {
  AppStatePanel,
  AutomationRunsPanel,
  AuthPanel,
  ExportJobsPanel,
  FolderList,
  MeetingList,
  RecentMeetingsPanel,
  SavedFiltersPanel,
  SecurityPanel,
  ToolbarFilters,
  type WebStatusTone,
  Workspace,
} from "./components.tsx";

interface GranolaWebBrowserConfig {
  passwordRequired: boolean;
}

interface GranolaWebAppState {
  apiKeyDraft: string;
  appState: GranolaAppState | null;
  automationRuns: GranolaAutomationActionRun[];
  detailError: string;
  folderError: string;
  folders: FolderSummaryRecord[];
  listError: string;
  meetingSource: MeetingSummarySource;
  meetings: MeetingSummaryRecord[];
  quickOpen: string;
  recentMeetings: WebWorkspacePreferences["recentMeetings"];
  savedFilters: WebWorkspacePreferences["savedFilters"];
  search: string;
  selectedFolderId: string | null;
  selectedMeetingBundle: GranolaMeetingBundle | null;
  selectedMeetingId: string | null;
  selectedMeeting: MeetingRecord | null;
  serverLocked: boolean;
  serverPassword: string;
  sort: GranolaMeetingSort;
  statusLabel: string;
  statusTone: WebStatusTone;
  updatedFrom: string;
  updatedTo: string;
  workspaceTab: WorkspaceTab;
}

function browserConfig(): GranolaWebBrowserConfig {
  return {
    passwordRequired: Boolean(window.__GRANOLA_SERVER__?.passwordRequired),
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok) {
    const error =
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : response.statusText || "Request failed";
    throw new Error(error);
  }

  return payload as T;
}

export function App() {
  const startup = startupSelectionFromSearch(window.location.search);
  const initialPreferences = parseWorkspacePreferences(
    window.localStorage.getItem(granolaWebWorkspaceStorageKey),
  );
  const [state, setState] = createStore<GranolaWebAppState>({
    apiKeyDraft: "",
    appState: null,
    automationRuns: [],
    detailError: "",
    folderError: "",
    folders: [],
    listError: "",
    meetingSource: "live",
    meetings: [],
    quickOpen: "",
    recentMeetings: initialPreferences.recentMeetings,
    savedFilters: initialPreferences.savedFilters,
    search: "",
    selectedFolderId: startup.folderId || null,
    selectedMeetingBundle: null,
    selectedMeetingId: startup.meetingId || null,
    selectedMeeting: null,
    serverLocked: browserConfig().passwordRequired,
    serverPassword: "",
    sort: "updated-desc",
    statusLabel: browserConfig().passwordRequired ? "Server locked" : "Connecting…",
    statusTone: browserConfig().passwordRequired ? "error" : "idle",
    updatedFrom: "",
    updatedTo: "",
    workspaceTab: parseWorkspaceTab(startup.workspaceTab),
  });

  let client: GranolaServerClient | null = null;
  let unsubscribe: (() => void) | undefined;

  const setStatus = (label: string, tone: WebStatusTone = "idle") => {
    setState({
      statusLabel: label,
      statusTone: tone,
    });
  };

  const updatePreferences = (
    updater: (preferences: WebWorkspacePreferences) => WebWorkspacePreferences,
  ) => {
    const next = updater({
      recentMeetings: state.recentMeetings,
      savedFilters: state.savedFilters,
    });
    window.localStorage.setItem(granolaWebWorkspaceStorageKey, serialiseWorkspacePreferences(next));
    setState("recentMeetings", next.recentMeetings);
    setState("savedFilters", next.savedFilters);
  };

  const mergeAuthState = async (authState?: GranolaAppAuthState) => {
    if (!client) {
      return;
    }

    const nextState = client.getState();

    if (authState) {
      setState("appState", {
        ...nextState,
        auth: authState,
      });
      return;
    }

    try {
      setState("appState", {
        ...nextState,
        auth: await client.inspectAuth(),
      });
    } catch {
      setState("appState", nextState);
    }
  };

  const detachClient = async () => {
    unsubscribe?.();
    unsubscribe = undefined;

    if (client) {
      await client.close().catch(() => undefined);
      client = null;
    }
  };

  const attachClient = async () => {
    await detachClient();
    client = await createGranolaServerClient(window.location.origin);
    setState("appState", client.getState());
    unsubscribe = client.subscribe((event) => {
      setState("appState", event.state);
    });
    await mergeAuthState();
  };

  const loadFolders = async (refresh = false) => {
    if (!client) {
      return;
    }

    try {
      setState("folderError", "");
      const result = await client.listFolders({
        forceRefresh: refresh,
        limit: 100,
      });
      setState("folders", result.folders);
      if (
        state.selectedFolderId &&
        !result.folders.some((folder) => folder.id === state.selectedFolderId)
      ) {
        setState("selectedFolderId", null);
      }
    } catch (error) {
      setState("folderError", error instanceof Error ? error.message : String(error));
      setState("folders", []);
      setState("selectedFolderId", null);
    }
  };

  const loadAutomationRuns = async () => {
    if (!client) {
      return;
    }

    try {
      const result = await client.listAutomationRuns({ limit: 20 });
      setState("automationRuns", result.runs);
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
    }
  };

  const loadMeeting = async (meetingId: string) => {
    if (!client) {
      return;
    }

    setState("selectedMeetingId", meetingId);
    try {
      setState("detailError", "");
      const bundle = await client.getMeeting(meetingId);
      setState("selectedMeetingBundle", bundle);
      setState("selectedMeeting", bundle.meeting);
      updatePreferences((preferences) =>
        rememberRecentMeeting(preferences, bundle.meeting.meeting),
      );
    } catch (error) {
      setState("selectedMeetingBundle", null);
      setState("selectedMeeting", null);
      setState("detailError", error instanceof Error ? error.message : String(error));
    }
  };

  const loadMeetings = async (options: { preferredMeetingId?: string; refresh?: boolean } = {}) => {
    if (!client) {
      return;
    }

    try {
      setState("listError", "");
      const result = await client.listMeetings({
        folderId: state.selectedFolderId || undefined,
        forceRefresh: options.refresh,
        limit: 100,
        search: state.search || undefined,
        sort: state.sort,
        updatedFrom: state.updatedFrom || undefined,
        updatedTo: state.updatedTo || undefined,
      });
      const preferredMeetingId = options.preferredMeetingId ?? state.selectedMeetingId;
      const nextMeetingId = selectMeetingId(result.meetings, preferredMeetingId);

      setState("meetings", result.meetings);
      setState("meetingSource", result.source);
      setState("selectedMeetingId", nextMeetingId);

      if (nextMeetingId) {
        await loadMeeting(nextMeetingId);
      } else {
        setState("selectedMeeting", null);
        setState("selectedMeetingBundle", null);
        setState("detailError", "");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState("listError", message);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("detailError", message);
    }
  };

  const refreshAll = async (forceRefresh = false) => {
    if (!client) {
      await attachClient();
    }

    setStatus(forceRefresh ? "Syncing…" : "Refreshing…", "busy");

    if (forceRefresh) {
      await client?.sync({
        forceRefresh: true,
        foreground: true,
      });
    }

    await Promise.all([loadFolders(forceRefresh), loadAutomationRuns(), mergeAuthState()]);
    await loadMeetings({ refresh: forceRefresh });

    setState("serverLocked", false);
    setStatus(
      forceRefresh
        ? "Sync complete"
        : state.meetingSource === "index"
          ? "Loaded from index"
          : "Connected",
      "ok",
    );
  };

  const connectAndRefresh = async (forceRefresh = false) => {
    try {
      await refreshAll(forceRefresh);
    } catch (error) {
      setStatus("Connection failed", "error");
      setState("detailError", error instanceof Error ? error.message : String(error));
    }
  };

  const quickOpenMeeting = async () => {
    if (!client) {
      return;
    }

    const query = state.quickOpen.trim();
    if (!query) {
      setStatus("Enter a title or id", "error");
      return;
    }

    setStatus("Opening meeting…", "busy");
    try {
      const bundle = await client.findMeeting(query);
      setState("selectedFolderId", bundle.meeting.meeting.folders[0]?.id || null);
      setState("search", "");
      setState("updatedFrom", "");
      setState("updatedTo", "");
      await loadMeetings({
        preferredMeetingId: bundle.document.id,
      });
      setStatus("Connected", "ok");
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Quick open failed", "error");
    }
  };

  const saveApiKey = async () => {
    if (!client) {
      return;
    }

    if (!state.apiKeyDraft.trim()) {
      setStatus("Enter a Granola API key", "error");
      return;
    }

    setStatus("Saving API key…", "busy");
    try {
      const auth = await client.loginAuth({
        apiKey: state.apiKeyDraft.trim(),
      });
      setState("apiKeyDraft", "");
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("API key save failed", "error");
    }
  };

  const importDesktopSession = async () => {
    if (!client) {
      return;
    }

    setStatus("Importing desktop session…", "busy");
    try {
      const auth = await client.loginAuth();
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Auth import failed", "error");
    }
  };

  const refreshAuth = async () => {
    if (!client) {
      return;
    }

    setStatus("Refreshing session…", "busy");
    try {
      const auth = await client.refreshAuth();
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Refresh failed", "error");
    }
  };

  const switchAuthMode = async (mode: GranolaAppAuthMode) => {
    if (!client) {
      return;
    }

    setStatus("Switching auth source…", "busy");
    try {
      const auth = await client.switchAuthMode(mode);
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Switch failed", "error");
    }
  };

  const logout = async () => {
    if (!client) {
      return;
    }

    setStatus("Signing out…", "busy");
    try {
      const auth = await client.logoutAuth();
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Sign out failed", "error");
    }
  };

  const exportNotes = async () => {
    if (!client) {
      return;
    }

    setStatus(state.selectedFolderId ? "Exporting folder notes…" : "Exporting notes…", "busy");
    try {
      await client.exportNotes("markdown", {
        folderId: state.selectedFolderId || undefined,
      });
      await refreshAll();
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Export failed", "error");
    }
  };

  const clearFilters = async () => {
    setState("search", "");
    setState("sort", "updated-desc");
    setState("updatedFrom", "");
    setState("updatedTo", "");
    setState("selectedFolderId", null);
    setState("selectedMeetingId", null);
    setState("selectedMeeting", null);
    setState("selectedMeetingBundle", null);
    await loadMeetings();
    setStatus("Filters cleared", "ok");
  };

  const saveCurrentFilter = () => {
    updatePreferences((preferences) =>
      saveWorkspaceFilter(
        preferences,
        {
          folders: state.folders,
          search: state.search,
          selectedFolderId: state.selectedFolderId,
          sort: state.sort,
          updatedFrom: state.updatedFrom,
          updatedTo: state.updatedTo,
        },
        {
          idFactory: () => `filter-${Date.now()}`,
        },
      ),
    );
    setStatus("Saved filter", "ok");
  };

  const applySavedFilterPreset = async (id: string) => {
    const preset = state.savedFilters.find((candidate) => candidate.id === id);
    if (!preset) {
      return;
    }

    const nextFilters = applyWorkspaceFilter(preset);
    setState("search", nextFilters.search);
    setState("selectedFolderId", nextFilters.selectedFolderId);
    setState("sort", nextFilters.sort as GranolaMeetingSort);
    setState("updatedFrom", nextFilters.updatedFrom);
    setState("updatedTo", nextFilters.updatedTo);
    setState("selectedMeetingId", null);
    setState("selectedMeeting", null);
    setState("selectedMeetingBundle", null);
    await loadMeetings();
    setStatus(`Applied ${preset.label}`, "ok");
  };

  const removeSavedFilterPreset = (id: string) => {
    updatePreferences((preferences) => removeWorkspaceFilter(preferences, id));
    setStatus("Removed saved filter", "ok");
  };

  const openRecentMeeting = async (meetingId: string, folderId?: string) => {
    if (folderId !== undefined) {
      setState("selectedFolderId", folderId || null);
      setState("selectedMeetingId", null);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      await loadMeetings({
        preferredMeetingId: meetingId,
      });
      return;
    }

    await loadMeeting(meetingId);
  };

  const meetingEmptyHint = () => {
    if (!state.appState) {
      return "Connect to the local server to load meetings.";
    }

    if (state.appState.auth.lastError) {
      return "Resolve auth first, then sync again.";
    }

    if (!state.appState.documents.loaded && !state.appState.sync.lastCompletedAt) {
      return "Run Sync now to populate your local meeting index.";
    }

    return "Try a different folder or filter, or sync again.";
  };

  const exportTranscripts = async () => {
    if (!client) {
      return;
    }

    setStatus(
      state.selectedFolderId ? "Exporting folder transcripts…" : "Exporting transcripts…",
      "busy",
    );
    try {
      await client.exportTranscripts("text", {
        folderId: state.selectedFolderId || undefined,
      });
      await refreshAll();
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Export failed", "error");
    }
  };

  const rerunJob = async (jobId: string) => {
    if (!client) {
      return;
    }

    setStatus("Rerunning export…", "busy");
    try {
      await client.rerunExportJob(jobId);
      await refreshAll();
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Rerun failed", "error");
    }
  };

  const resolveAutomationRun = async (id: string, decision: "approve" | "reject") => {
    if (!client) {
      return;
    }

    setStatus(decision === "approve" ? "Approving automation…" : "Rejecting automation…", "busy");
    try {
      await client.resolveAutomationRun(id, decision);
      await refreshAll();
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Automation decision failed", "error");
    }
  };

  const unlockServer = async () => {
    if (!state.serverPassword.trim()) {
      setStatus("Enter the server password", "error");
      return;
    }

    setStatus("Unlocking server…", "busy");
    try {
      await requestJson("/auth/unlock", {
        body: JSON.stringify({ password: state.serverPassword }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setState("serverPassword", "");
      setState("serverLocked", false);
      await connectAndRefresh(true);
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Unlock failed", "error");
    }
  };

  const lockServer = async () => {
    try {
      await requestJson("/auth/lock", {
        method: "POST",
      });
    } catch {
      // Locking is best-effort from the client perspective.
    }

    await detachClient();
    setState({
      appState: null,
      automationRuns: [],
      detailError: "",
      folderError: "",
      folders: [],
      listError: "",
      meetings: [],
      selectedFolderId: null,
      selectedMeeting: null,
      selectedMeetingBundle: null,
      selectedMeetingId: null,
      serverLocked: true,
      serverPassword: "",
    });
    setStatus("Server locked", "error");
  };

  createEffect(() => {
    const nextPath = buildBrowserUrlPath(window.location.href, {
      selectedFolderId: state.selectedFolderId,
      selectedMeetingId: state.selectedMeetingId,
      workspaceTab: state.workspaceTab,
    });
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextPath !== currentPath) {
      history.replaceState(null, "", nextPath);
    }
  });

  createEffect(() => {
    if (!state.appState?.automation.loaded || !client) {
      return;
    }

    void loadAutomationRuns();
  });

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const nextTab = nextWorkspaceTab(state.workspaceTab, event.key);
      if (nextTab) {
        setState("workspaceTab", nextTab);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
    });

    if (!state.serverLocked) {
      void connectAndRefresh();
    }
  });

  onCleanup(() => {
    void detachClient();
  });

  return (
    <div class="shell">
      <aside class="pane sidebar">
        <ToolbarFilters
          onQuickOpen={() => {
            void quickOpenMeeting();
          }}
          onQuickOpenInput={(value) => {
            setState("quickOpen", value);
          }}
          onSearchInput={(value) => {
            setState("search", value.trim());
            void loadMeetings();
          }}
          onSortChange={(value) => {
            setState("sort", value);
            void loadMeetings();
          }}
          onUpdatedFromChange={(value) => {
            setState("updatedFrom", value);
            void loadMeetings();
          }}
          onUpdatedToChange={(value) => {
            setState("updatedTo", value);
            void loadMeetings();
          }}
          quickOpen={state.quickOpen}
          search={state.search}
          sort={state.sort}
          updatedFrom={state.updatedFrom}
          updatedTo={state.updatedTo}
        />
        <SavedFiltersPanel
          folders={state.folders}
          onApply={(preset) => {
            void applySavedFilterPreset(preset.id);
          }}
          onRemove={removeSavedFilterPreset}
          onSaveCurrent={saveCurrentFilter}
          savedFilters={state.savedFilters}
          search={state.search}
          selectedFolderId={state.selectedFolderId}
          sort={state.sort}
          updatedFrom={state.updatedFrom}
          updatedTo={state.updatedTo}
        />
        <RecentMeetingsPanel
          onOpen={(meeting) => {
            void openRecentMeeting(meeting.id, meeting.folderId);
          }}
          recentMeetings={state.recentMeetings}
        />
        <FolderList
          error={state.folderError}
          folders={state.folders}
          onSelect={(folderId) => {
            setState("selectedFolderId", folderId);
            setState("selectedMeetingId", null);
            setState("selectedMeeting", null);
            setState("selectedMeetingBundle", null);
            void loadMeetings();
          }}
          selectedFolderId={state.selectedFolderId}
        />
        <MeetingList
          error={state.listError}
          emptyHint={meetingEmptyHint()}
          folders={state.folders}
          meetings={state.meetings}
          onSelect={(meetingId) => {
            void loadMeeting(meetingId);
          }}
          search={state.search}
          selectedFolderId={state.selectedFolderId}
          selectedMeetingId={state.selectedMeetingId}
          updatedFrom={state.updatedFrom}
          updatedTo={state.updatedTo}
        />
      </aside>
      <main class="pane detail">
        <AppStatePanel
          appState={state.appState}
          statusLabel={state.statusLabel}
          statusTone={state.statusTone}
        />
        <section class="toolbar">
          <div class="toolbar-actions">
            <button
              class="button button--primary"
              onClick={() => {
                void connectAndRefresh(true);
              }}
              type="button"
            >
              Sync now
            </button>
            <button
              class="button button--secondary"
              onClick={() => {
                void clearFilters();
              }}
              type="button"
            >
              Clear Filters
            </button>
            <button
              class="button button--secondary"
              onClick={() => {
                void exportNotes();
              }}
              type="button"
            >
              Export Notes
            </button>
            <button
              class="button button--secondary"
              onClick={() => {
                void exportTranscripts();
              }}
              type="button"
            >
              Export Transcripts
            </button>
          </div>
          <p>
            Solid-powered web workspace on top of the same local server, sync loop, and shared app
            contracts.
          </p>
        </section>
        <SecurityPanel
          onLock={() => {
            void lockServer();
          }}
          onPasswordChange={(value) => {
            setState("serverPassword", value);
          }}
          onUnlock={() => {
            void unlockServer();
          }}
          password={state.serverPassword}
          visible={state.serverLocked}
        />
        <AuthPanel
          apiKeyDraft={state.apiKeyDraft}
          auth={state.appState?.auth}
          onApiKeyDraftChange={(value) => {
            setState("apiKeyDraft", value);
          }}
          onImportDesktopSession={() => {
            void importDesktopSession();
          }}
          onLogout={() => {
            void logout();
          }}
          onRefresh={() => {
            void refreshAuth();
          }}
          onSaveApiKey={() => {
            void saveApiKey();
          }}
          onSwitchMode={(mode) => {
            void switchAuthMode(mode);
          }}
        />
        <ExportJobsPanel
          jobs={state.appState?.exports.jobs || []}
          onRerun={(jobId) => {
            void rerunJob(jobId);
          }}
        />
        <AutomationRunsPanel
          onApprove={(runId) => {
            void resolveAutomationRun(runId, "approve");
          }}
          onReject={(runId) => {
            void resolveAutomationRun(runId, "reject");
          }}
          runs={state.automationRuns}
        />
        <Workspace
          bundle={state.selectedMeetingBundle}
          detailError={state.detailError}
          onSelectTab={(tab) => {
            setState("workspaceTab", tab);
          }}
          selectedMeeting={state.selectedMeeting}
          tab={state.workspaceTab}
        />
      </main>
    </div>
  );
}
