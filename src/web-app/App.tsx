/** @jsxImportSource solid-js */

import { createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

import {
  buildBrowserUrlPath,
  granWebWorkspaceStorageKey,
  nextWorkspaceTab,
  parseWorkspacePreferences,
  parseWorkspaceTab,
  readWorkspacePreferencesStorage,
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
  defaultExportTargetNotesFormat,
  defaultExportTargetNotesSubdir,
  defaultExportTargetTranscriptsFormat,
  defaultExportTargetTranscriptsSubdir,
} from "../export-target-registry.ts";
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
  useWebClientController,
} from "./browser-hooks.ts";
import { useReviewController } from "./browser-review.ts";
import {
  folderFreshnessNote,
  meetingContextSummary,
  meetingFreshnessNote,
  meetingListFreshnessNote,
} from "./component-helpers.ts";
import {
  clearAutomationCapabilityState,
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
    readWorkspacePreferencesStorage(window.localStorage),
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
    automationArtefactPublishPreview: null,
    automationArtefactPublishPreviewError: "",
    automationArtefactPublishPreviewLoading: false,
    automationArtefacts: [],
    automationRules: [],
    appState: null,
    automationRuns: [],
    detailError: "",
    exportMode: "both",
    exportTargets: [],
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
    pkmTargets: [],
    processingIssueError: "",
    processingIssues: [],
    preferredProvider: "openrouter",
    recentMeetings: initialPreferences.recentMeetings,
    savedFilters: initialPreferences.savedFilters,
    search: "",
    serverInfo: null,
    selectedAutomationArtefactId: null,
    selectedExportTargetId: null,
    selectedFolderId: startup.folderId || null,
    selectedHarnessId: null,
    selectedMeetingBundle: null,
    selectedMeetingId: startup.meetingId || null,
    selectedMeeting: null,
    selectedPkmTargetId: null,
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
    window.localStorage.setItem(granWebWorkspaceStorageKey, serialiseWorkspacePreferences(next));
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
      reviewController.loadAutomationRules(),
      reviewController.loadProcessingIssues(),
    ]);
  };

  const advancedAutomationVisible = () =>
    automationEnabled() &&
    (state.activePage === "review" ||
      (state.activePage === "settings" && state.settingsTab === "diagnostics"));

  const loadAdvancedAutomationPanels = async () => {
    automationPanelsHydrated = true;
    await Promise.all([
      reviewController.loadAutomationArtefacts(),
      reviewController.loadPkmTargets(),
      harnessController.loadHarnesses(),
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

  const loadExportTargets = async () => {
    const client = clientController.clientAccessor();
    if (!client) {
      return;
    }

    const result = await client.listExportTargets();
    setState("exportTargets", result.targets);
    if (
      state.selectedExportTargetId &&
      !result.targets.some((target) => target.id === state.selectedExportTargetId)
    ) {
      setState("selectedExportTargetId", null);
    }
  };

  const selectedExportTarget = () =>
    state.exportTargets.find((target) => target.id === state.selectedExportTargetId) ?? null;
  const currentExportScopeLabel = () =>
    state.selectedFolderId
      ? state.folders.find((folder) => folder.id === state.selectedFolderId)?.name ||
        state.selectedFolderId
      : "All meetings";
  const exportDestinationSummary = () => {
    const target = selectedExportTarget();
    if (target) {
      const notesSubdir = target.notesSubdir || defaultExportTargetNotesSubdir(target.kind);
      const transcriptsSubdir =
        target.transcriptsSubdir || defaultExportTargetTranscriptsSubdir(target.kind);
      return `${target.name ?? target.id} · ${notesSubdir} + ${transcriptsSubdir}`;
    }

    const notesPath = state.appState?.config.notes.output || "Configured notes output";
    const transcriptsPath =
      state.appState?.config.transcripts.output || "Configured transcript output";
    return `${notesPath} + ${transcriptsPath}`;
  };
  const defaultArchiveSummary = () => {
    const notesPath = state.appState?.config.notes.output || "Configured notes output";
    const transcriptsPath =
      state.appState?.config.transcripts.output || "Configured transcript output";
    return `${notesPath} + ${transcriptsPath}`;
  };

  const saveKnowledgeBase = async (target: import("../app/index.ts").GranolaExportTarget) => {
    const client = clientController.clientAccessor();
    if (!client) {
      return;
    }

    const existing = await client.listExportTargets();
    const nextTargets = [
      target,
      ...existing.targets.filter((candidate) => candidate.id !== target.id),
    ].sort((left, right) => left.id.localeCompare(right.id));
    const result = await client.saveExportTargets(nextTargets);
    setState("exportTargets", result.targets);
    setState("selectedExportTargetId", target.id);
    setStatus(`Saved knowledge base ${target.name ?? target.id}`, "ok");
  };

  const removeKnowledgeBase = async (id: string) => {
    const client = clientController.clientAccessor();
    if (!client) {
      return;
    }

    const existing = await client.listExportTargets();
    const nextTargets = existing.targets.filter((candidate) => candidate.id !== id);
    const result = await client.saveExportTargets(nextTargets);
    setState("exportTargets", result.targets);
    if (state.selectedExportTargetId === id) {
      setState("selectedExportTargetId", null);
    }
    setStatus("Removed knowledge base", "ok");
  };

  const runBundledExport = async () => {
    const client = clientController.clientAccessor();
    if (!client) {
      return;
    }

    const target = selectedExportTarget();
    const folderId = state.selectedFolderId || undefined;
    const scopeLabel = folderId ? currentExportScopeLabel() : "all meetings";
    setStatus(`Exporting ${scopeLabel}…`, "busy");
    try {
      if (state.exportMode !== "transcripts") {
        await client.exportNotes(
          target ? (target.notesFormat ?? defaultExportTargetNotesFormat(target.kind)) : "markdown",
          {
            folderId,
            scopedOutput: true,
            targetId: target?.id,
          },
        );
      }
      if (state.exportMode !== "notes") {
        await client.exportTranscripts(
          target
            ? (target.transcriptsFormat ?? defaultExportTargetTranscriptsFormat(target.kind))
            : "text",
          {
            folderId,
            scopedOutput: true,
            targetId: target?.id,
          },
        );
      }
      await refreshAll();
      setStatus(target ? `Exported via ${target.name ?? target.id}` : "Export complete", "ok");
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
      loadExportTargets(),
    ];

    if (automationEnabled()) {
      refreshTasks.push(loadReviewPanels());
      if (advancedAutomationVisible() || automationPanelsHydrated) {
        refreshTasks.push(loadAdvancedAutomationPanels());
      }
    } else {
      automationPanelsHydrated = false;
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

    if (!advancedAutomationVisible()) {
      return;
    }

    if (automationPanelsHydrated) {
      return;
    }

    void loadAdvancedAutomationPanels();
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

    if (current?.kind === "artefact" && current.draft.id !== state.selectedAutomationArtefactId) {
      reviewController.applySelectedArtefactDrafts(current.draft);
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
      setState("settingsTab", "diagnostics");

      if (pluginExposesAutomationCapability(nextPlugin) && !enabled) {
        setState("activePage", "settings");
        clearAutomationCapabilityState(setState);
        automationPanelsHydrated = false;
        setStatus(`${pluginLabel} disabled`, "ok");
        return;
      }

      if (pluginExposesAutomationCapability(nextPlugin) && enabled) {
        await loadReviewPanels();
        if (advancedAutomationVisible()) {
          await loadAdvancedAutomationPanels();
        }
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
                onImportDesktopSession={() => {
                  void clientController.importDesktopSession();
                }}
                onRunSync={() => {
                  void connectAndRefresh(true);
                }}
                onSaveApiKey={() => {
                  void clientController.saveApiKey();
                }}
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
                onOpenReviewPage={() => {
                  if (automationEnabled()) {
                    void browseController.openPage("review");
                  }
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
                    onClearApiKey={() => {
                      void clientController.clearApiKey(refreshAll);
                    }}
                    onDuplicateHarness={harnessController.duplicateHarness}
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
                    processingIssues={state.processingIssues}
                    currentExportScopeLabel={currentExportScopeLabel()}
                    defaultArchiveSummary={defaultArchiveSummary()}
                    exportDestinationSummary={exportDestinationSummary()}
                    exportMode={state.exportMode}
                    exportTargets={state.exportTargets}
                    onExportModeChange={(mode) => {
                      setState("exportMode", mode);
                    }}
                    onRunExport={() => {
                      void runBundledExport();
                    }}
                    onSaveKnowledgeBase={(target) => {
                      void saveKnowledgeBase(target);
                    }}
                    onSelectExportTarget={(id) => {
                      setState("selectedExportTargetId", id);
                    }}
                    onRemoveKnowledgeBase={(id) => {
                      void removeKnowledgeBase(id);
                    }}
                    selectedExportTargetId={state.selectedExportTargetId}
                    selectedHarness={harnessController.selectedHarness()}
                    selectedHarnessId={state.selectedHarnessId}
                    selectedMeeting={state.selectedMeeting}
                    serverInfo={state.serverInfo}
                    serverLocked={state.serverLocked}
                    settingsTab="diagnostics"
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
                  artefactPublishPreview={state.automationArtefactPublishPreview}
                  artefactPublishPreviewError={state.automationArtefactPublishPreviewError}
                  artefactPublishPreviewLoading={state.automationArtefactPublishPreviewLoading}
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
                  onSelectPublishTarget={(targetId) => {
                    void reviewController.selectAutomationArtefactPublishTarget(targetId);
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
                  selectedPkmTargetId={state.selectedPkmTargetId}
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
                onClearApiKey={() => {
                  void clientController.clearApiKey(refreshAll);
                }}
                onDuplicateHarness={harnessController.duplicateHarness}
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
                processingIssues={state.processingIssues}
                currentExportScopeLabel={currentExportScopeLabel()}
                defaultArchiveSummary={defaultArchiveSummary()}
                exportDestinationSummary={exportDestinationSummary()}
                exportMode={state.exportMode}
                exportTargets={state.exportTargets}
                onExportModeChange={(mode) => {
                  setState("exportMode", mode);
                }}
                onRunExport={() => {
                  void runBundledExport();
                }}
                onSaveKnowledgeBase={(target) => {
                  void saveKnowledgeBase(target);
                }}
                onSelectExportTarget={(id) => {
                  setState("selectedExportTargetId", id);
                }}
                onRemoveKnowledgeBase={(id) => {
                  void removeKnowledgeBase(id);
                }}
                selectedExportTargetId={state.selectedExportTargetId}
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
