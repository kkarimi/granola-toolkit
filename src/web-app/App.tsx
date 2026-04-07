/** @jsxImportSource solid-js */

import { createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

import {
  buildBrowserUrlPath,
  granolaWebWorkspaceStorageKey,
  nextWorkspaceTab,
  parseWorkspacePreferences,
  parseWorkspaceTab,
  serialiseWorkspacePreferences,
  startupSelectionFromSearch,
  type WebWorkspacePreferences,
} from "../web/client-state.ts";
import {
  buildPluginState,
  findPluginState,
  isPluginCapabilityEnabled,
} from "../app/plugin-state.ts";
import { defaultPluginDefinitions } from "../plugin-registry.ts";
import {
  AppStatePanel,
  PrimaryNav,
  SecurityPanel,
  type WebMainPage,
  type WebStatusTone,
} from "./components.tsx";
import {
  browserConfig,
  useHarnessController,
  useMeetingBrowserController,
  useReviewController,
  useWebClientController,
} from "./browser-hooks.ts";
import {
  folderFreshnessNote,
  meetingContextSummary,
  meetingFreshnessNote,
  meetingListFreshnessNote,
} from "./component-helpers.ts";
import {
  clearAutomationCapabilityState,
  loadAutomationCapabilityState,
  pluginExposesAutomationCapability,
} from "./plugin-effects.ts";
import { deriveOnboardingState, OnboardingPanel } from "./onboarding.tsx";
import {
  FoldersPageController,
  HomePageController,
  MeetingPageController,
  ReviewPageController,
  SearchPageController,
  SettingsPageController,
} from "./page-controllers.tsx";
import type { GranolaWebAppState, MeetingReturnPage } from "./types.ts";

export function App() {
  const startup = startupSelectionFromSearch(window.location.search);
  const initialPreferences = parseWorkspacePreferences(
    window.localStorage.getItem(granolaWebWorkspaceStorageKey),
  );
  const initialPage: WebMainPage = startup.meetingId
    ? "meeting"
    : startup.folderId
      ? "folders"
      : "home";
  const initialReturnPage: MeetingReturnPage = startup.folderId ? "folders" : "home";
  const [state, setState] = createStore<GranolaWebAppState>({
    activePage: initialPage,
    apiKeyDraft: "",
    advancedSearchQuery: "",
    automationArtefactDraftMarkdown: "",
    automationArtefactDraftSummary: "",
    automationArtefactDraftTitle: "",
    automationArtefactError: "",
    automationArtefacts: [],
    automationRules: [],
    appState: null,
    automationRuns: [],
    detailError: "",
    folderError: "",
    folders: [],
    foldersLoading: false,
    homeMeetings: [],
    homeMeetingsError: "",
    homeMeetingsLoading: false,
    harnessDirty: false,
    harnessError: "",
    harnessExplainEventKind: null,
    harnessExplanations: [],
    harnessTestKind: "notes",
    harnessTestResult: null,
    harnesses: [],
    listError: "",
    meetingLoading: false,
    meetingSource: "live",
    meetings: [],
    meetingsLoading: false,
    processingIssueError: "",
    processingIssues: [],
    preferredProvider: "openrouter",
    recentMeetings: initialPreferences.recentMeetings,
    savedFilters: initialPreferences.savedFilters,
    search: "",
    serverInfo: null,
    selectedAutomationArtefactId: null,
    selectedFolderId: startup.folderId || null,
    selectedHarnessId: null,
    selectedMeetingBundle: null,
    selectedMeetingId: startup.meetingId || null,
    selectedMeeting: null,
    selectedReviewInboxKey: null,
    searchSubmitted: false,
    reviewNote: "",
    meetingReturnPage: initialReturnPage,
    serverLocked: browserConfig().passwordRequired,
    serverPassword: "",
    settingsTab: "auth",
    sort: "updated-desc",
    statusLabel: browserConfig().passwordRequired ? "Server locked" : "Connecting…",
    statusTone: browserConfig().passwordRequired ? "error" : "idle",
    updatedFrom: "",
    updatedTo: "",
    workspaceTab: parseWorkspaceTab(startup.workspaceTab),
  });

  let automationPanelsHydrated = false;
  const fallbackPlugins = defaultPluginDefinitions().map((definition) =>
    buildPluginState(definition, definition.defaultEnabled),
  );
  const plugins = () => state.appState?.plugins.items ?? fallbackPlugins;
  const automationEnabled = () => isPluginCapabilityEnabled(state.appState?.plugins, "automation");
  const markdownViewerEnabled = () =>
    isPluginCapabilityEnabled(state.appState?.plugins, "markdown-rendering", true);
  const replacePluginState = (nextPlugin: ReturnType<typeof buildPluginState>) => {
    if (!state.appState) {
      return;
    }

    setState("appState", "plugins", (current) => ({
      items: current.items.map((plugin) => (plugin.id === nextPlugin.id ? nextPlugin : plugin)),
      loaded: true,
    }));
  };
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

  const clientController = useWebClientController({
    origin: window.location.origin,
    setState,
    setStatus,
    state,
  });

  const reviewController = useReviewController({
    clientAccessor: clientController.clientAccessor,
    setState,
    setStatus,
    state,
  });

  const harnessController = useHarnessController({
    clientAccessor: clientController.clientAccessor,
    setState,
    setStatus,
    state,
  });

  const loadReviewPanels = async () => {
    await Promise.all([
      reviewController.loadAutomationRuns(),
      reviewController.loadAutomationArtefacts(),
      reviewController.loadProcessingIssues(),
    ]);
  };

  const browseController = useMeetingBrowserController({
    clientAccessor: clientController.clientAccessor,
    loadAutomationArtefacts: reviewController.loadAutomationArtefacts,
    loadHarnessExplanations: harnessController.loadHarnessExplanations,
    loadReviewPanels,
    setState,
    setStatus,
    state,
    updatePreferences,
  });

  const exportNotes = async () => {
    const client = clientController.clientAccessor();
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

  const exportTranscripts = async () => {
    const client = clientController.clientAccessor();
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
    const client = clientController.clientAccessor();
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
    try {
      await reviewController.resolveAutomationRun(id, decision);
      await refreshAll();
    } catch {
      // The controller already updates status and error state.
    }
  };

  const recoverProcessingIssue = async (id: string) => {
    try {
      await reviewController.recoverProcessingIssue(id);
      await refreshAll();
    } catch {
      // The controller already updates status and error state.
    }
  };

  const refreshAll = async (forceRefresh = false) => {
    if (!clientController.clientAccessor()) {
      await clientController.attachClient();
    }

    setStatus(forceRefresh ? "Syncing…" : "Refreshing…", "busy");

    if (forceRefresh) {
      await clientController.clientAccessor()?.sync({
        forceRefresh: true,
        foreground: true,
      });
    }

    const refreshTasks: Promise<unknown>[] = [
      browseController.loadFolders(forceRefresh),
      browseController.loadHomeMeetings(forceRefresh),
      clientController.mergeAuthState(),
    ];

    if (automationEnabled()) {
      refreshTasks.push(
        loadAutomationCapabilityState({
          loadAutomationArtefacts: reviewController.loadAutomationArtefacts,
          loadAutomationRules: reviewController.loadAutomationRules,
          loadAutomationRuns: reviewController.loadAutomationRuns,
          loadHarnesses: harnessController.loadHarnesses,
          loadProcessingIssues: reviewController.loadProcessingIssues,
        }),
      );
    } else {
      clearAutomationCapabilityState(setState);
    }

    await Promise.all(refreshTasks);

    if (state.selectedMeetingId && !browseController.hasMeetingBrowseScope()) {
      await browseController.loadMeeting(state.selectedMeetingId);
      setState("meetings", []);
    } else {
      await browseController.loadMeetings({ refresh: forceRefresh });
    }

    setState("serverLocked", false);
    setStatus(
      forceRefresh
        ? "Sync complete"
        : state.meetingSource === "index"
          ? "Loaded from index"
          : state.meetingSource === "snapshot"
            ? "Loaded from snapshot"
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

  createEffect(() => {
    const nextPath = buildBrowserUrlPath(window.location.href, {
      selectedFolderId:
        state.activePage === "folders" || state.activePage === "meeting"
          ? state.selectedFolderId
          : null,
      selectedMeetingId: state.activePage === "meeting" ? state.selectedMeetingId : null,
      workspaceTab: state.workspaceTab,
    });
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextPath !== currentPath) {
      history.replaceState(null, "", nextPath);
    }
  });

  createEffect(() => {
    if (
      !automationEnabled() ||
      !state.appState?.automation.loaded ||
      !clientController.clientAccessor()
    ) {
      automationPanelsHydrated = false;
      return;
    }

    if (automationPanelsHydrated) {
      return;
    }

    automationPanelsHydrated = true;
    void reviewController.loadAutomationRuns();
    void reviewController.loadAutomationArtefacts();
    void reviewController.loadProcessingIssues();
  });

  createEffect(() => {
    const current =
      reviewController
        .reviewInboxItems()
        .find((item) => item.key === state.selectedReviewInboxKey) ??
      reviewController.reviewInboxItems()[0] ??
      null;
    const nextKey = current?.key ?? null;

    if (nextKey !== state.selectedReviewInboxKey) {
      setState("selectedReviewInboxKey", nextKey);
    }

    if (
      current?.kind === "artefact" &&
      current.artefact.id !== state.selectedAutomationArtefactId
    ) {
      reviewController.applySelectedArtefactDrafts(current.artefact);
    }
  });

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (state.activePage !== "meeting") {
        return;
      }

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
    void clientController.detachClient();
  });

  const onboardingState = () =>
    deriveOnboardingState({
      appState: state.appState,
      automationRuleCount: state.automationRules.length,
      harnesses: state.harnesses,
      meetingsLoadedCount: state.meetings.length,
      serverInfo: state.serverInfo,
    });

  const showOnboarding = () => {
    const onboarding = onboardingState();
    return !state.serverLocked && !(onboarding.connected && onboarding.synced);
  };
  const searchResultsVisible = () =>
    state.searchSubmitted && browseController.hasMeetingBrowseScope();
  const meetingReturnLabel = () =>
    state.meetingReturnPage === "folders"
      ? "Back to folders"
      : state.meetingReturnPage === "review"
        ? "Back to review"
        : state.meetingReturnPage === "search"
          ? "Back to search"
          : state.meetingReturnPage === "settings"
            ? "Back to settings"
            : "Back to home";
  const meetingDescription = () => {
    if (!state.selectedMeeting) {
      return "Choose a meeting from folders, search, review, or recent activity.";
    }

    const selectedFolderLabel =
      state.folders.find((folder) => folder.id === state.selectedFolderId)?.name ||
      state.selectedFolderId;
    return meetingContextSummary(
      state.selectedMeeting,
      state.selectedMeetingBundle,
      selectedFolderLabel,
    );
  };
  const foldersFreshness = () => folderFreshnessNote(state.appState);
  const meetingListFreshness = () =>
    meetingListFreshnessNote({
      appState: state.appState,
      meetingSource: state.meetingSource,
      selectedFolderLabel:
        state.folders.find((folder) => folder.id === state.selectedFolderId)?.name ||
        state.selectedFolderId,
    });
  const meetingFreshness = () =>
    meetingFreshnessNote({
      appState: state.appState,
      bundle: state.selectedMeetingBundle,
      meeting: state.selectedMeeting,
      meetingSource: state.meetingSource,
      selectedFolderLabel:
        state.folders.find((folder) => folder.id === state.selectedFolderId)?.name ||
        state.selectedFolderId,
    });

  const togglePlugin = async (id: string, enabled: boolean) => {
    const client = clientController.clientAccessor();
    if (!client) {
      return;
    }

    const plugin =
      findPluginState(state.appState?.plugins, id) ??
      plugins().find((candidate) => candidate.id === id);
    const pluginLabel = plugin?.label ?? "Plugin";
    setStatus(
      enabled
        ? `Enabling ${pluginLabel.toLowerCase()}…`
        : `Disabling ${pluginLabel.toLowerCase()}…`,
      "busy",
    );
    try {
      const nextPlugin = await client.setPluginEnabled(id, enabled);
      replacePluginState(nextPlugin);
      setState("settingsTab", "plugins");

      if (pluginExposesAutomationCapability(nextPlugin) && !enabled) {
        setState("activePage", "settings");
        clearAutomationCapabilityState(setState);
        setStatus(`${pluginLabel} disabled`, "ok");
        return;
      }

      if (pluginExposesAutomationCapability(nextPlugin) && enabled) {
        await loadAutomationCapabilityState({
          loadAutomationArtefacts: reviewController.loadAutomationArtefacts,
          loadAutomationRules: reviewController.loadAutomationRules,
          loadAutomationRuns: reviewController.loadAutomationRuns,
          loadHarnesses: harnessController.loadHarnesses,
          loadProcessingIssues: reviewController.loadProcessingIssues,
        });
      }
      setStatus(`${pluginLabel} ${enabled ? "enabled" : "disabled"}`, "ok");
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Plugin update failed", "error");
    }
  };

  return (
    <Show
      when={!state.serverLocked && !showOnboarding()}
      fallback={
        <div class="shell shell--onboarding">
          <main class="pane detail detail--onboarding">
            <AppStatePanel
              appState={state.appState}
              heading="Home"
              reviewSummary={reviewController.reviewInboxSummary()}
              serverInfo={state.serverInfo}
              statusLabel={state.statusLabel}
              statusTone={state.statusTone}
            />
            <SecurityPanel
              onLock={() => {
                void clientController.lockServer();
              }}
              onPasswordChange={(value) => {
                setState("serverPassword", value);
              }}
              onUnlock={() => {
                void clientController.unlockServer(connectAndRefresh);
              }}
              password={state.serverPassword}
              visible={state.serverLocked}
            />
            {!state.serverLocked ? (
              <OnboardingPanel
                apiKeyDraft={state.apiKeyDraft}
                auth={state.appState?.auth}
                folders={state.folders}
                meetingsLoadedCount={state.meetings.length}
                onApiKeyDraftChange={(value) => {
                  setState("apiKeyDraft", value);
                }}
                onCreateStarterPipeline={() => {
                  void harnessController.createStarterPipeline(refreshAll);
                }}
                onImportDesktopSession={() => {
                  void clientController.importDesktopSession();
                }}
                onRunSync={() => {
                  void connectAndRefresh(true);
                }}
                onSaveApiKey={() => {
                  void clientController.saveApiKey();
                }}
                onSelectProvider={(provider) => {
                  setState("preferredProvider", provider);
                }}
                preferredProvider={state.preferredProvider}
                state={onboardingState()}
              />
            ) : null}
            {!state.serverLocked && state.detailError && !state.meetingLoading ? (
              <section class="jobs-panel">
                <div class="auth-card">
                  <div class="auth-card__meta auth-card__error">{state.detailError}</div>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      }
    >
      <div class="app-shell">
        <PrimaryNav
          activePage={state.activePage}
          onNavigate={(page) => {
            if (page === "home") {
              void browseController.clearFilters();
              return;
            }

            void browseController.openPage(page);
          }}
          reviewEnabled={automationEnabled()}
          reviewSummary={reviewController.reviewInboxSummary()}
        />
        <main class="pane app-main">
          <Switch>
            <Match when={state.activePage === "home"}>
              <HomePageController
                appState={state.appState}
                automationEnabled={automationEnabled()}
                folders={state.folders}
                foldersLoading={state.foldersLoading}
                latestMeetings={state.homeMeetings}
                latestMeetingsLoading={state.homeMeetingsLoading}
                onOpenFolder={(folderId) => {
                  void browseController.openPage("folders", { folderId });
                }}
                onOpenLatestMeeting={(meeting) => {
                  void browseController.openMeetingFromPage(meeting.id, "home", {
                    folderId: meeting.folders[0]?.id || null,
                  });
                }}
                onOpenMeeting={(meeting) => {
                  void browseController.openRecentMeeting(meeting.id, meeting.folderId);
                }}
                onOpenFoldersPage={() => {
                  void browseController.openPage("folders");
                }}
                onOpenReviewPage={() => {
                  if (automationEnabled()) {
                    void browseController.openPage("review");
                  }
                }}
                onOpenSearchPage={() => {
                  void browseController.openPage("search");
                }}
                onOpenSettingsTab={(tab) => {
                  setState("settingsTab", tab);
                  setState("activePage", "settings");
                }}
                processingIssues={state.processingIssues}
                recentMeetings={state.recentMeetings}
                reviewSummary={reviewController.reviewInboxSummary()}
                serverInfo={state.serverInfo}
              />
            </Match>
            <Match when={state.activePage === "folders"}>
              <FoldersPageController
                directoryFreshnessNote={foldersFreshness()}
                folderError={state.folderError}
                folders={state.folders}
                foldersLoading={state.foldersLoading}
                listError={state.listError}
                meetingFreshnessNote={meetingListFreshness()}
                meetingEmptyHint={browseController.meetingEmptyHint()}
                meetings={state.meetings}
                meetingsLoading={state.meetingsLoading}
                onBackToFolders={() => {
                  void browseController.openPage("folders");
                }}
                onExportNotes={() => {
                  void exportNotes();
                }}
                onExportTranscripts={() => {
                  void exportTranscripts();
                }}
                onOpenMeeting={(meetingId) => {
                  void browseController.openMeetingFromPage(meetingId, "folders", {
                    folderId: state.selectedFolderId,
                  });
                }}
                onRefreshFolders={() => {
                  void browseController.loadFolders(true);
                }}
                onSelectFolder={(folderId) => {
                  void browseController.openPage("folders", { folderId });
                }}
                selectedFolder={browseController.selectedFolder()}
                selectedFolderId={state.selectedFolderId}
                selectedMeetingId={state.selectedMeetingId}
              />
            </Match>
            <Match when={state.activePage === "search"}>
              <SearchPageController
                advancedQuery={state.advancedSearchQuery}
                freshnessNote={meetingListFreshness()}
                onAdvancedQueryChange={(value) => {
                  setState("advancedSearchQuery", value);
                }}
                onClear={() => {
                  void browseController.clearSearch();
                }}
                onOpenAdvanced={() => {
                  void browseController.openAdvancedMeeting();
                }}
                onQueryChange={(value) => {
                  setState("search", value.trim());
                  setState("searchSubmitted", false);
                }}
                onRun={() => {
                  void browseController.runSearch();
                }}
                onSortChange={(value) => {
                  setState("sort", value);
                  setState("searchSubmitted", false);
                }}
                onUpdatedFromChange={(value) => {
                  setState("updatedFrom", value);
                  setState("searchSubmitted", false);
                }}
                onUpdatedToChange={(value) => {
                  setState("updatedTo", value);
                  setState("searchSubmitted", false);
                }}
                query={state.search}
                searchResultsVisible={searchResultsVisible()}
                selectedFolderId={state.selectedFolderId}
                selectedMeetingId={state.selectedMeetingId}
                sort={state.sort}
                updatedFrom={state.updatedFrom}
                updatedTo={state.updatedTo}
                folders={state.folders}
                hasRecentMeetings={state.recentMeetings.length > 0}
                listError={state.listError}
                meetingEmptyHint={browseController.meetingEmptyHint()}
                meetings={state.meetings}
                meetingsLoading={state.meetingsLoading}
                onOpenMeeting={(meetingId) => {
                  void browseController.openMeetingFromPage(meetingId, "search");
                }}
              />
            </Match>
            <Match when={state.activePage === "review"}>
              <Show
                when={automationEnabled()}
                fallback={
                  <SettingsPageController
                    apiKeyDraft={state.apiKeyDraft}
                    appState={state.appState}
                    auth={state.appState?.auth}
                    automationRuns={state.automationRuns}
                    harnessDirty={state.harnessDirty}
                    harnessError={state.harnessError}
                    harnessExplanations={state.harnessExplanations}
                    harnessExplanationEventKind={state.harnessExplainEventKind}
                    harnesses={state.harnesses}
                    harnessTestKind={state.harnessTestKind}
                    harnessTestResult={state.harnessTestResult}
                    onApiKeyDraftChange={(value) => {
                      setState("apiKeyDraft", value);
                    }}
                    onApproveRun={(runId) => {
                      void resolveAutomationRun(runId, "approve");
                    }}
                    onChangeHarness={harnessController.updateHarness}
                    onDuplicateHarness={harnessController.duplicateHarness}
                    onExportNotes={() => {
                      void exportNotes();
                    }}
                    onExportTranscripts={() => {
                      void exportTranscripts();
                    }}
                    onImportDesktopSession={() => {
                      void clientController.importDesktopSession();
                    }}
                    onLock={() => {
                      void clientController.lockServer();
                    }}
                    onLogout={() => {
                      void clientController.logout(refreshAll);
                    }}
                    onNewHarness={harnessController.createHarness}
                    onOpenMeeting={(meetingId) => {
                      void browseController.openMeetingFromPage(meetingId, "settings");
                    }}
                    onPasswordChange={(value) => {
                      setState("serverPassword", value);
                    }}
                    onRecover={(issueId) => {
                      void recoverProcessingIssue(issueId);
                    }}
                    onRefreshAuth={() => {
                      void clientController.refreshAuth(refreshAll);
                    }}
                    onRejectRun={(runId) => {
                      void resolveAutomationRun(runId, "reject");
                    }}
                    onReloadHarnesses={() => {
                      void harnessController.reloadHarnesses();
                    }}
                    onRemoveHarness={harnessController.removeHarness}
                    onRerunJob={(jobId) => {
                      void rerunJob(jobId);
                    }}
                    onSaveApiKey={() => {
                      void clientController.saveApiKey();
                    }}
                    onSaveHarnesses={() => {
                      void harnessController.saveHarnesses();
                    }}
                    onSelectHarness={(id) => {
                      setState("selectedHarnessId", id);
                      setState("harnessTestResult", null);
                    }}
                    onTogglePlugin={(id, enabled) => {
                      void togglePlugin(id, enabled);
                    }}
                    onSwitchMode={(mode) => {
                      void clientController.switchAuthMode(mode, refreshAll);
                    }}
                    onTestHarness={() => {
                      void harnessController.testHarness();
                    }}
                    onTestKindChange={(kind) => {
                      setState("harnessTestKind", kind);
                    }}
                    onUnlock={() => {
                      void clientController.unlockServer(connectAndRefresh);
                    }}
                    password={state.serverPassword}
                    plugins={plugins()}
                    preferredProvider={state.preferredProvider}
                    processingIssues={state.processingIssues}
                    selectedHarness={harnessController.selectedHarness()}
                    selectedHarnessId={state.selectedHarnessId}
                    selectedMeeting={state.selectedMeeting}
                    serverInfo={state.serverInfo}
                    serverLocked={state.serverLocked}
                    settingsTab="plugins"
                    setSettingsTab={(tab) => {
                      setState("settingsTab", tab);
                    }}
                    statusLabel={state.statusLabel}
                  />
                }
              >
                <ReviewPageController
                  artefactDraftMarkdown={state.automationArtefactDraftMarkdown}
                  artefactDraftSummary={state.automationArtefactDraftSummary}
                  artefactDraftTitle={state.automationArtefactDraftTitle}
                  artefactError={state.automationArtefactError}
                  markdownViewerEnabled={markdownViewerEnabled()}
                  onApproveArtefact={() => {
                    void reviewController.resolveAutomationArtefact("approve");
                  }}
                  onApproveRun={(runId) => {
                    void resolveAutomationRun(runId, "approve");
                  }}
                  onDraftMarkdownChange={(value) => {
                    setState("automationArtefactDraftMarkdown", value);
                  }}
                  onDraftSummaryChange={(value) => {
                    setState("automationArtefactDraftSummary", value);
                  }}
                  onDraftTitleChange={(value) => {
                    setState("automationArtefactDraftTitle", value);
                  }}
                  onOpenMeeting={(meetingId) => {
                    void browseController.openMeetingFromPage(meetingId, "review");
                  }}
                  onRecover={(issueId) => {
                    void recoverProcessingIssue(issueId);
                  }}
                  onRefresh={() => {
                    void connectAndRefresh(true);
                  }}
                  onRejectArtefact={() => {
                    void reviewController.resolveAutomationArtefact("reject");
                  }}
                  onRejectRun={(runId) => {
                    void resolveAutomationRun(runId, "reject");
                  }}
                  onRerunArtefact={() => {
                    void reviewController.rerunAutomationArtefact();
                  }}
                  onReviewNoteChange={(value) => {
                    setState("reviewNote", value);
                  }}
                  onSaveArtefact={() => {
                    void reviewController.saveAutomationArtefact();
                  }}
                  onSelectItem={(key) => {
                    void reviewController.selectReviewInboxItem(key, {
                      loadMeeting: browseController.loadMeeting,
                    });
                  }}
                  reviewItems={reviewController.reviewInboxItems()}
                  reviewNote={state.reviewNote}
                  reviewSummary={reviewController.reviewInboxSummary()}
                  selectedArtefact={reviewController.selectedReviewArtefact()}
                  selectedBundle={state.selectedMeetingBundle}
                  selectedIssue={reviewController.selectedReviewIssue()}
                  selectedKey={state.selectedReviewInboxKey}
                  selectedKind={reviewController.selectedReviewInboxItem()?.kind}
                  selectedRun={reviewController.selectedReviewRun()}
                />
              </Show>
            </Match>
            <Match when={state.activePage === "settings"}>
              <SettingsPageController
                apiKeyDraft={state.apiKeyDraft}
                appState={state.appState}
                auth={state.appState?.auth}
                automationRuns={state.automationRuns}
                harnessDirty={state.harnessDirty}
                harnessError={state.harnessError}
                harnessExplanations={state.harnessExplanations}
                harnessExplanationEventKind={state.harnessExplainEventKind}
                harnesses={state.harnesses}
                harnessTestKind={state.harnessTestKind}
                harnessTestResult={state.harnessTestResult}
                onApiKeyDraftChange={(value) => {
                  setState("apiKeyDraft", value);
                }}
                onApproveRun={(runId) => {
                  void resolveAutomationRun(runId, "approve");
                }}
                onChangeHarness={harnessController.updateHarness}
                onDuplicateHarness={harnessController.duplicateHarness}
                onExportNotes={() => {
                  void exportNotes();
                }}
                onExportTranscripts={() => {
                  void exportTranscripts();
                }}
                onImportDesktopSession={() => {
                  void clientController.importDesktopSession();
                }}
                onLock={() => {
                  void clientController.lockServer();
                }}
                onLogout={() => {
                  void clientController.logout(refreshAll);
                }}
                onNewHarness={harnessController.createHarness}
                onOpenMeeting={(meetingId) => {
                  void browseController.openMeetingFromPage(meetingId, "settings");
                }}
                onPasswordChange={(value) => {
                  setState("serverPassword", value);
                }}
                onRecover={(issueId) => {
                  void recoverProcessingIssue(issueId);
                }}
                onRefreshAuth={() => {
                  void clientController.refreshAuth(refreshAll);
                }}
                onRejectRun={(runId) => {
                  void resolveAutomationRun(runId, "reject");
                }}
                onReloadHarnesses={() => {
                  void harnessController.reloadHarnesses();
                }}
                onRemoveHarness={harnessController.removeHarness}
                onRerunJob={(jobId) => {
                  void rerunJob(jobId);
                }}
                onSaveApiKey={() => {
                  void clientController.saveApiKey();
                }}
                onSaveHarnesses={() => {
                  void harnessController.saveHarnesses();
                }}
                onSelectHarness={(id) => {
                  setState("selectedHarnessId", id);
                  setState("harnessTestResult", null);
                }}
                onTogglePlugin={(id, enabled) => {
                  void togglePlugin(id, enabled);
                }}
                onSwitchMode={(mode) => {
                  void clientController.switchAuthMode(mode, refreshAll);
                }}
                onTestHarness={() => {
                  void harnessController.testHarness();
                }}
                onTestKindChange={(kind) => {
                  setState("harnessTestKind", kind);
                }}
                onUnlock={() => {
                  void clientController.unlockServer(connectAndRefresh);
                }}
                password={state.serverPassword}
                plugins={plugins()}
                preferredProvider={state.preferredProvider}
                processingIssues={state.processingIssues}
                selectedHarness={harnessController.selectedHarness()}
                selectedHarnessId={state.selectedHarnessId}
                selectedMeeting={state.selectedMeeting}
                serverInfo={state.serverInfo}
                serverLocked={state.serverLocked}
                settingsTab={state.settingsTab}
                setSettingsTab={(tab) => {
                  setState("settingsTab", tab);
                }}
                statusLabel={state.statusLabel}
              />
            </Match>
            <Match when={state.activePage === "meeting"}>
              <MeetingPageController
                detailError={state.detailError}
                freshnessNote={meetingFreshness()}
                meetingLoading={state.meetingLoading}
                markdownViewerEnabled={markdownViewerEnabled()}
                meetingDescription={meetingDescription()}
                meetingReturnLabel={meetingReturnLabel()}
                onBack={() => {
                  setState("activePage", state.meetingReturnPage);
                }}
                onSelectTab={(tab) => {
                  setState("workspaceTab", tab);
                }}
                selectedBundle={state.selectedMeetingBundle}
                selectedMeeting={state.selectedMeeting}
                selectedMeetingId={state.selectedMeetingId}
                workspaceTab={state.workspaceTab}
              />
            </Match>
          </Switch>
        </main>
      </div>
    </Show>
  );
}
