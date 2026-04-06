/** @jsxImportSource solid-js */

import { createEffect, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";

import type {
  FolderSummaryRecord,
  GranolaAgentHarness,
  GranolaAgentHarnessMatchExplanation,
  GranolaAutomationArtefact,
  GranolaAutomationRule,
  GranolaAutomationArtefactKind,
  GranolaAutomationEvaluationRun,
  GranolaAutomationActionRun,
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppState,
  GranolaMeetingBundle,
  GranolaMeetingSort,
  GranolaSyncEventKind,
  MeetingRecord,
  MeetingSummaryRecord,
  MeetingSummarySource,
} from "../app/index.ts";
import { buildGranolaReviewInbox, summariseGranolaReviewInbox } from "../review-inbox.ts";
import { createGranolaServerClient, type GranolaServerClient } from "../server/client.ts";
import type { GranolaServerInfo } from "../transport.ts";
import { granolaTransportPaths } from "../transport.ts";
import type { GranolaAgentProviderKind } from "../types.ts";
import {
  buildBrowserUrlPath,
  granolaWebWorkspaceStorageKey,
  hasScopedMeetingBrowse,
  parseWorkspacePreferences,
  rememberRecentMeeting,
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
  ArtefactReviewPanel,
  AutomationRunsPanel,
  AuthPanel,
  BrowsePromptPanel,
  DiagnosticsPanel,
  ExportJobsPanel,
  FolderList,
  HomeDashboardPanel,
  IssueReviewPanel,
  MeetingList,
  PageHeader,
  PrimaryNav,
  ProcessingIssuesPanel,
  ReviewInboxPanel,
  RunReviewPanel,
  SearchWorkspacePanel,
  SecurityPanel,
  type WebMainPage,
  type WebSettingsSection,
  type WebStatusTone,
  Workspace,
} from "./components.tsx";
import {
  HarnessEditorPanel,
  createHarnessTemplate,
  duplicateHarnessTemplate,
} from "./harness-editor.tsx";
import { buildStarterPipeline, deriveOnboardingState, OnboardingPanel } from "./onboarding.tsx";

type MeetingReturnPage = Exclude<WebMainPage, "meeting">;

interface GranolaWebBrowserConfig {
  passwordRequired: boolean;
}

interface GranolaWebAppState {
  activePage: WebMainPage;
  apiKeyDraft: string;
  advancedSearchQuery: string;
  automationArtefactDraftMarkdown: string;
  automationArtefactDraftSummary: string;
  automationArtefactDraftTitle: string;
  automationArtefactError: string;
  automationArtefacts: GranolaAutomationArtefact[];
  automationRules: GranolaAutomationRule[];
  appState: GranolaAppState | null;
  automationRuns: GranolaAutomationActionRun[];
  detailError: string;
  folderError: string;
  folders: FolderSummaryRecord[];
  homeMeetings: MeetingSummaryRecord[];
  homeMeetingsError: string;
  harnessDirty: boolean;
  harnessError: string;
  harnessExplainEventKind: GranolaSyncEventKind | null;
  harnessExplanations: GranolaAgentHarnessMatchExplanation[];
  harnessTestKind: GranolaAutomationArtefactKind;
  harnessTestResult: GranolaAutomationEvaluationRun | null;
  harnesses: GranolaAgentHarness[];
  listError: string;
  meetingSource: MeetingSummarySource;
  meetings: MeetingSummaryRecord[];
  processingIssueError: string;
  processingIssues: import("../app/index.ts").GranolaProcessingIssue[];
  preferredProvider: GranolaAgentProviderKind;
  recentMeetings: WebWorkspacePreferences["recentMeetings"];
  savedFilters: WebWorkspacePreferences["savedFilters"];
  search: string;
  serverInfo: GranolaServerInfo | null;
  selectedAutomationArtefactId: string | null;
  selectedFolderId: string | null;
  selectedHarnessId: string | null;
  selectedMeetingBundle: GranolaMeetingBundle | null;
  selectedMeetingId: string | null;
  selectedMeeting: MeetingRecord | null;
  selectedReviewInboxKey: string | null;
  searchSubmitted: boolean;
  reviewNote: string;
  meetingReturnPage: MeetingReturnPage;
  serverLocked: boolean;
  serverPassword: string;
  settingsTab: WebSettingsSection;
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
    homeMeetings: [],
    homeMeetingsError: "",
    harnessDirty: false,
    harnessError: "",
    harnessExplainEventKind: null,
    harnessExplanations: [],
    harnessTestKind: "notes",
    harnessTestResult: null,
    harnesses: [],
    listError: "",
    meetingSource: "live",
    meetings: [],
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

  let client: GranolaServerClient | null = null;
  let automationPanelsHydrated = false;
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
    setState("serverInfo", null);
  };

  const attachClient = async () => {
    await detachClient();
    client = await createGranolaServerClient(window.location.origin);
    setState("serverInfo", client.info);
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
        limit: 500,
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

  const loadHomeMeetings = async (refresh = false) => {
    if (!client) {
      return;
    }

    try {
      setState("homeMeetingsError", "");
      const result = await client.listMeetings({
        forceRefresh: refresh,
        limit: 365,
        sort: "updated-desc",
      });
      setState("homeMeetings", result.meetings);
    } catch (error) {
      setState("homeMeetingsError", error instanceof Error ? error.message : String(error));
      setState("homeMeetings", []);
    }
  };

  const loadAutomationRules = async () => {
    if (!client) {
      return;
    }

    try {
      const result = await client.listAutomationRules();
      setState("automationRules", result.rules);
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setState("automationRules", []);
    }
  };

  const applySelectedArtefactDrafts = (artefact: GranolaAutomationArtefact | null) => {
    setState("selectedAutomationArtefactId", artefact?.id ?? null);
    setState("automationArtefactDraftTitle", artefact?.structured.title ?? "");
    setState("automationArtefactDraftSummary", artefact?.structured.summary ?? "");
    setState("automationArtefactDraftMarkdown", artefact?.structured.markdown ?? "");
    setState("reviewNote", "");
  };

  const syncSelectedArtefact = (
    artefacts: GranolaAutomationArtefact[],
    options: {
      preferredId?: string | null;
      preferredMeetingId?: string | null;
    } = {},
  ) => {
    const preferred =
      (options.preferredId
        ? artefacts.find((candidate) => candidate.id === options.preferredId)
        : undefined) ??
      (options.preferredMeetingId
        ? artefacts.find(
            (candidate) =>
              candidate.meetingId === options.preferredMeetingId &&
              candidate.status === "generated",
          )
        : undefined) ??
      artefacts.find((candidate) => candidate.status === "generated") ??
      artefacts[0];

    applySelectedArtefactDrafts(preferred ?? null);
  };

  const loadAutomationArtefacts = async (
    options: {
      preferredId?: string | null;
      preferredMeetingId?: string | null;
    } = {},
  ) => {
    if (!client) {
      return;
    }

    try {
      setState("automationArtefactError", "");
      const result = await client.listAutomationArtefacts({ limit: 30 });
      setState("automationArtefacts", result.artefacts);
      syncSelectedArtefact(result.artefacts, {
        preferredId: options.preferredId ?? state.selectedAutomationArtefactId,
        preferredMeetingId: options.preferredMeetingId ?? state.selectedMeetingId,
      });
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setState("automationArtefacts", []);
      syncSelectedArtefact([]);
    }
  };

  const loadProcessingIssues = async () => {
    if (!client) {
      return;
    }

    try {
      setState("processingIssueError", "");
      const result = await client.listProcessingIssues({ limit: 20 });
      setState("processingIssues", result.issues);
    } catch (error) {
      setState("processingIssueError", error instanceof Error ? error.message : String(error));
      setState("processingIssues", []);
    }
  };

  const selectHarnessId = (harnesses: GranolaAgentHarness[], preferredId?: string | null) => {
    if (preferredId && harnesses.some((harness) => harness.id === preferredId)) {
      return preferredId;
    }

    return harnesses[0]?.id ?? null;
  };

  const selectedHarness = () =>
    state.harnesses.find((harness) => harness.id === state.selectedHarnessId) ?? null;

  const loadHarnessExplanations = async (meetingId: string | null) => {
    if (!client || !meetingId) {
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      return;
    }

    try {
      const result = await client.explainAgentHarnesses(meetingId);
      setState("harnessExplainEventKind", result.eventKind);
      setState("harnessExplanations", result.harnesses);
    } catch (error) {
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      setState("harnessError", error instanceof Error ? error.message : String(error));
    }
  };

  const loadHarnesses = async (preferredId?: string | null) => {
    if (!client) {
      return;
    }

    try {
      setState("harnessError", "");
      const result = await client.listAgentHarnesses();
      const nextSelectedHarnessId = selectHarnessId(
        result.harnesses,
        preferredId ?? state.selectedHarnessId,
      );
      setState("harnesses", result.harnesses);
      setState("selectedHarnessId", nextSelectedHarnessId);
      const nextPreferredProvider = result.harnesses.find((harness) => harness.provider)?.provider;
      if (nextPreferredProvider) {
        setState("preferredProvider", nextPreferredProvider);
      }
      setState("harnessDirty", false);
      setState("harnessTestResult", null);
      await loadHarnessExplanations(state.selectedMeetingId);
    } catch (error) {
      setState("harnessError", error instanceof Error ? error.message : String(error));
      setState("harnesses", []);
      setState("selectedHarnessId", null);
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      setState("harnessTestResult", null);
    }
  };

  const reviewInboxItems = () =>
    buildGranolaReviewInbox({
      artefacts: state.automationArtefacts,
      issues: state.processingIssues,
      runs: state.automationRuns,
    });

  const reviewInboxSummary = () => summariseGranolaReviewInbox(reviewInboxItems());

  const selectedReviewInboxItem = () =>
    reviewInboxItems().find((item) => item.key === state.selectedReviewInboxKey) ??
    reviewInboxItems()[0] ??
    null;

  const selectedReviewIssue = () => {
    const item = selectedReviewInboxItem();
    return item?.kind === "issue" ? item.issue : null;
  };

  const selectedReviewRun = () => {
    const item = selectedReviewInboxItem();
    return item?.kind === "run" ? item.run : null;
  };

  const selectedReviewArtefact = () => {
    const item = selectedReviewInboxItem();
    return item?.kind === "artefact" ? item.artefact : selectedAutomationArtefact();
  };

  const selectedFolder = () =>
    state.folders.find((folder) => folder.id === state.selectedFolderId) ?? null;

  const openPage = async (page: MeetingReturnPage) => {
    if (page === "home") {
      setState("activePage", "home");
      return;
    }

    if (page === "folders") {
      setState("activePage", "folders");
      setState("search", "");
      setState("updatedFrom", "");
      setState("updatedTo", "");
      setState("searchSubmitted", false);
      setState("selectedFolderId", null);
      setState("selectedMeetingId", null);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("meetings", []);
      setState("listError", "");
      if (state.folders.length === 0) {
        await loadFolders(true);
      }
      return;
    }

    if (page === "search") {
      setState("activePage", "search");
      setState("selectedFolderId", null);
      setState("selectedMeetingId", null);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("searchSubmitted", false);
      setState("meetings", []);
      setState("listError", "");
      return;
    }

    if (page === "review") {
      setState("activePage", "review");
      await Promise.all([loadAutomationRuns(), loadAutomationArtefacts(), loadProcessingIssues()]);
      return;
    }

    setState("activePage", "settings");
  };

  const updateHarness = (nextHarness: GranolaAgentHarness) => {
    setState(
      "harnesses",
      state.harnesses.map((harness) => (harness.id === nextHarness.id ? nextHarness : harness)),
    );
    setState("selectedHarnessId", nextHarness.id);
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const createHarness = () => {
    const nextHarness = createHarnessTemplate(state.harnesses);
    setState("harnesses", [...state.harnesses, nextHarness]);
    setState("selectedHarnessId", nextHarness.id);
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const duplicateHarness = () => {
    const harness = selectedHarness();
    if (!harness) {
      return;
    }

    const nextHarness = duplicateHarnessTemplate(state.harnesses, harness);
    setState("harnesses", [...state.harnesses, nextHarness]);
    setState("selectedHarnessId", nextHarness.id);
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const removeHarness = () => {
    if (!state.selectedHarnessId) {
      return;
    }

    const nextHarnesses = state.harnesses.filter(
      (harness) => harness.id !== state.selectedHarnessId,
    );
    setState("harnesses", nextHarnesses);
    setState("selectedHarnessId", selectHarnessId(nextHarnesses, null));
    setState("harnessDirty", true);
    setState("harnessTestResult", null);
  };

  const saveHarnesses = async () => {
    if (!client) {
      return;
    }

    setStatus("Saving harnesses…", "busy");
    try {
      const result = await client.saveAgentHarnesses(state.harnesses);
      const nextSelectedHarnessId = selectHarnessId(result.harnesses, state.selectedHarnessId);
      setState("harnesses", result.harnesses);
      setState("selectedHarnessId", nextSelectedHarnessId);
      const nextPreferredProvider = result.harnesses.find((harness) => harness.provider)?.provider;
      if (nextPreferredProvider) {
        setState("preferredProvider", nextPreferredProvider);
      }
      setState("harnessDirty", false);
      setState("harnessError", "");
      await loadHarnessExplanations(state.selectedMeetingId);
      setStatus("Harnesses saved", "ok");
    } catch (error) {
      setState("harnessError", error instanceof Error ? error.message : String(error));
      setStatus("Harness save failed", "error");
    }
  };

  const reloadHarnesses = async () => {
    setStatus("Reloading harnesses…", "busy");
    await loadHarnesses(state.selectedHarnessId);
    setStatus("Harnesses reloaded", "ok");
  };

  const createStarterPipeline = async () => {
    if (!client) {
      return;
    }

    setStatus("Creating starter pipeline…", "busy");
    try {
      const [currentHarnesses, currentRules] = await Promise.all([
        client.listAgentHarnesses(),
        client.listAutomationRules(),
      ]);
      const starter = buildStarterPipeline({
        harnesses: currentHarnesses.harnesses,
        provider: state.preferredProvider,
        rules: currentRules.rules,
      });

      await client.saveAgentHarnesses(starter.harnesses);
      await client.saveAutomationRules(starter.rules);
      await refreshAll();
      setStatus("Starter pipeline ready", "ok");
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Starter pipeline setup failed", "error");
    }
  };

  const testHarness = async () => {
    if (!client) {
      return;
    }

    const harness = selectedHarness();
    if (!harness) {
      setStatus("Select a harness first", "error");
      return;
    }

    const meetingId = state.selectedMeetingId;
    if (!meetingId) {
      setStatus("Select a meeting first", "error");
      return;
    }

    setStatus("Testing harness…", "busy");
    try {
      const bundle =
        state.selectedMeetingBundle?.document.id === meetingId
          ? state.selectedMeetingBundle
          : await client.getMeeting(meetingId, { requireCache: true });
      const result = await client.evaluateAutomationCases(
        [
          {
            bundle,
            id: `web:${meetingId}`,
            title: bundle.meeting.meeting.title || bundle.document.title || bundle.document.id,
          },
        ],
        {
          harnessIds: [harness.id],
          kind: state.harnessTestKind,
          model: harness.model,
          provider: harness.provider,
        },
      );
      setState("harnessTestResult", result.results[0] ?? null);
      setStatus("Harness test complete", "ok");
    } catch (error) {
      setState("harnessTestResult", {
        caseId: `web:${meetingId}`,
        caseTitle: state.selectedMeeting?.meeting.title || meetingId,
        error: error instanceof Error ? error.message : String(error),
        harnessId: harness.id,
        harnessName: harness.name,
        prompt: "",
        status: "failed",
      });
      setStatus("Harness test failed", "error");
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
      await loadHarnessExplanations(bundle.document.id);
      await loadAutomationArtefacts({
        preferredId: state.selectedAutomationArtefactId,
        preferredMeetingId: bundle.document.id,
      });
    } catch (error) {
      setState("selectedMeetingBundle", null);
      setState("selectedMeeting", null);
      setState("detailError", error instanceof Error ? error.message : String(error));
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
    }
  };

  const hasMeetingBrowseScope = () =>
    hasScopedMeetingBrowse({
      search: state.search,
      selectedFolderId: state.selectedFolderId,
      updatedFrom: state.updatedFrom,
      updatedTo: state.updatedTo,
    });

  const loadMeetings = async (options: { preferredMeetingId?: string; refresh?: boolean } = {}) => {
    if (!client) {
      return;
    }

    if (!hasMeetingBrowseScope() && !options.preferredMeetingId && !state.selectedMeetingId) {
      setState("listError", "");
      setState("meetings", []);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("detailError", "");
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
      await loadAutomationArtefacts({
        preferredId: state.selectedAutomationArtefactId,
        preferredMeetingId: null,
      });
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
        setState("harnessExplainEventKind", null);
        setState("harnessExplanations", []);
        await loadAutomationArtefacts({
          preferredId: state.selectedAutomationArtefactId,
          preferredMeetingId: null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setState("listError", message);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("detailError", message);
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
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

    await Promise.all([
      loadFolders(forceRefresh),
      loadHomeMeetings(forceRefresh),
      loadHarnesses(),
      loadAutomationRules(),
      loadAutomationRuns(),
      loadAutomationArtefacts(),
      loadProcessingIssues(),
      mergeAuthState(),
    ]);

    if (state.selectedMeetingId && !hasMeetingBrowseScope()) {
      await loadMeeting(state.selectedMeetingId);
      setState("meetings", []);
    } else {
      await loadMeetings({ refresh: forceRefresh });
    }

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

  const openMeetingFromPage = async (
    meetingId: string,
    page: MeetingReturnPage,
    options: { folderId?: string | null } = {},
  ) => {
    if (options.folderId !== undefined) {
      setState("selectedFolderId", options.folderId || null);
    }

    setState("meetingReturnPage", page);
    setState("activePage", "meeting");
    await loadMeeting(meetingId);
  };

  const openAdvancedMeeting = async () => {
    if (!client) {
      return;
    }

    const query = state.advancedSearchQuery.trim();
    if (!query) {
      setStatus("Enter an exact title or meeting id", "error");
      return;
    }

    setStatus("Opening meeting…", "busy");
    try {
      const bundle = await client.findMeeting(query);
      setState("advancedSearchQuery", "");
      setState("selectedFolderId", bundle.meeting.meeting.folders[0]?.id || null);
      setState("search", "");
      setState("updatedFrom", "");
      setState("updatedTo", "");
      setState("searchSubmitted", false);
      await openMeetingFromPage(bundle.document.id, "search", {
        folderId: bundle.meeting.meeting.folders[0]?.id || null,
      });
      setStatus("Meeting opened", "ok");
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Advanced search failed", "error");
    }
  };

  const saveApiKey = async () => {
    if (!state.apiKeyDraft.trim()) {
      setStatus("Enter a Granola API key", "error");
      return;
    }

    setStatus("Saving API key…", "busy");
    try {
      const auth = await requestJson<GranolaAppAuthState>(granolaTransportPaths.authLogin, {
        body: JSON.stringify({
          apiKey: state.apiKeyDraft.trim(),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setState("apiKeyDraft", "");
      setState("detailError", "");
      if (state.appState) {
        setState("appState", "auth", auth);
      }
      setStatus("API key saved", "ok");
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("API key save failed", "error");
    }
  };

  const importDesktopSession = async () => {
    setStatus("Importing desktop session…", "busy");
    try {
      const auth = await requestJson<GranolaAppAuthState>(granolaTransportPaths.authLogin, {
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      setState("detailError", "");
      if (state.appState) {
        setState("appState", "auth", auth);
      }
      setStatus("Desktop session imported", "ok");
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Auth import failed", "error");
    }
  };

  const refreshAuth = async () => {
    setStatus("Refreshing session…", "busy");
    try {
      const auth = await requestJson<GranolaAppAuthState>(granolaTransportPaths.authRefresh, {
        method: "POST",
      });
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Refresh failed", "error");
    }
  };

  const switchAuthMode = async (mode: GranolaAppAuthMode) => {
    setStatus("Switching auth source…", "busy");
    try {
      const auth = await requestJson<GranolaAppAuthState>(granolaTransportPaths.authMode, {
        body: JSON.stringify({ mode }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      await mergeAuthState(auth);
      await refreshAll();
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Switch failed", "error");
    }
  };

  const logout = async () => {
    setStatus("Signing out…", "busy");
    try {
      const auth = await requestJson<GranolaAppAuthState>(granolaTransportPaths.authLogout, {
        method: "POST",
      });
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
    setState("searchSubmitted", false);
    setState("activePage", "home");
    await loadMeetings();
    setStatus("Back at home", "ok");
  };

  const openRecentMeeting = async (meetingId: string, folderId?: string) => {
    await openMeetingFromPage(meetingId, folderId ? "folders" : "home", {
      folderId: folderId || null,
    });
  };

  const runSearch = async () => {
    setState("activePage", "search");
    setState("searchSubmitted", true);
    setState("selectedMeetingId", null);
    setState("selectedMeeting", null);
    setState("selectedMeetingBundle", null);
    await loadMeetings();
    setStatus("Search updated", "ok");
  };

  const clearSearch = async () => {
    setState("search", "");
    setState("sort", "updated-desc");
    setState("updatedFrom", "");
    setState("updatedTo", "");
    setState("selectedFolderId", null);
    setState("selectedMeetingId", null);
    setState("selectedMeeting", null);
    setState("selectedMeetingBundle", null);
    setState("searchSubmitted", false);
    setState("meetings", []);
    setState("listError", "");
    setStatus("Search cleared", "ok");
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

    return "Try a different folder or search, or sync again.";
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

  const selectedAutomationArtefact = () =>
    state.automationArtefacts.find(
      (artefact) => artefact.id === state.selectedAutomationArtefactId,
    ) || null;

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

  const recoverProcessingIssue = async (id: string) => {
    if (!client) {
      return;
    }

    setStatus("Recovering processing issue…", "busy");
    try {
      const result = await client.recoverProcessingIssue(id);
      await refreshAll();
      setStatus(
        result.runCount > 0
          ? `Recovered ${result.issue.kind} and re-ran ${result.runCount} pipeline${result.runCount === 1 ? "" : "s"}`
          : `Recovered ${result.issue.kind}`,
        "ok",
      );
    } catch (error) {
      setState("processingIssueError", error instanceof Error ? error.message : String(error));
      setStatus("Recovery failed", "error");
    }
  };

  const selectReviewInboxItem = async (key: string) => {
    setState("selectedReviewInboxKey", key);
    const item = reviewInboxItems().find((candidate) => candidate.key === key);
    if (!item) {
      return;
    }

    try {
      if (item.kind === "artefact") {
        await selectAutomationArtefact(item.artefact.id);
        return;
      }

      if (item.meetingId && item.meetingId !== state.selectedMeetingId) {
        await loadMeeting(item.meetingId);
      }
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Unable to open review item", "error");
    }
  };

  const selectAutomationArtefact = async (id: string) => {
    if (!client) {
      return;
    }

    try {
      const artefact =
        state.automationArtefacts.find((candidate) => candidate.id === id) ??
        (await client.getAutomationArtefact(id));
      setState("selectedReviewInboxKey", `artefact:${artefact.id}`);
      applySelectedArtefactDrafts(artefact);
      if (artefact.meetingId !== state.selectedMeetingId) {
        await loadMeeting(artefact.meetingId);
      }
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Unable to open artefact", "error");
    }
  };

  const saveAutomationArtefact = async () => {
    if (!client || !state.selectedAutomationArtefactId) {
      return;
    }

    setStatus("Saving artefact edits…", "busy");
    try {
      const artefact = await client.updateAutomationArtefact(state.selectedAutomationArtefactId, {
        markdown: state.automationArtefactDraftMarkdown,
        note: state.reviewNote || undefined,
        summary: state.automationArtefactDraftSummary,
        title: state.automationArtefactDraftTitle,
      });
      await loadAutomationArtefacts({
        preferredId: artefact.id,
        preferredMeetingId: artefact.meetingId,
      });
      await loadAutomationRuns();
      setStatus("Artefact updated", "ok");
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Artefact save failed", "error");
    }
  };

  const resolveAutomationArtefact = async (decision: "approve" | "reject") => {
    if (!client || !state.selectedAutomationArtefactId) {
      return;
    }

    setStatus(decision === "approve" ? "Approving artefact…" : "Rejecting artefact…", "busy");
    try {
      const artefact = await client.resolveAutomationArtefact(
        state.selectedAutomationArtefactId,
        decision,
        {
          note: state.reviewNote || undefined,
        },
      );
      await loadAutomationArtefacts({
        preferredId: artefact.id,
        preferredMeetingId: artefact.meetingId,
      });
      await loadAutomationRuns();
      setStatus(decision === "approve" ? "Artefact approved" : "Artefact rejected", "ok");
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Artefact decision failed", "error");
    }
  };

  const rerunAutomationArtefact = async () => {
    if (!client || !state.selectedAutomationArtefactId) {
      return;
    }

    setStatus("Rerunning artefact pipeline…", "busy");
    try {
      const artefact = await client.rerunAutomationArtefact(state.selectedAutomationArtefactId);
      await loadAutomationArtefacts({
        preferredId: artefact.id,
        preferredMeetingId: artefact.meetingId,
      });
      await loadAutomationRuns();
      setStatus("Artefact rerun complete", "ok");
    } catch (error) {
      setState("automationArtefactError", error instanceof Error ? error.message : String(error));
      setStatus("Artefact rerun failed", "error");
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
      activePage: "home",
      appState: null,
      advancedSearchQuery: "",
      automationArtefactDraftMarkdown: "",
      automationArtefactDraftSummary: "",
      automationArtefactDraftTitle: "",
      automationArtefactError: "",
      automationArtefacts: [],
      automationRules: [],
      automationRuns: [],
      detailError: "",
      folderError: "",
      folders: [],
      homeMeetings: [],
      homeMeetingsError: "",
      harnessDirty: false,
      harnessError: "",
      harnessExplainEventKind: null,
      harnessExplanations: [],
      harnessTestResult: null,
      harnesses: [],
      listError: "",
      meetings: [],
      processingIssueError: "",
      processingIssues: [],
      searchSubmitted: false,
      reviewNote: "",
      selectedAutomationArtefactId: null,
      selectedFolderId: null,
      selectedHarnessId: null,
      selectedMeeting: null,
      selectedMeetingBundle: null,
      selectedMeetingId: null,
      meetingReturnPage: "home",
      serverLocked: true,
      serverPassword: "",
      settingsTab: "auth",
    });
    setStatus("Server locked", "error");
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
    if (!state.appState?.automation.loaded || !client) {
      automationPanelsHydrated = false;
      return;
    }

    if (automationPanelsHydrated) {
      return;
    }

    automationPanelsHydrated = true;
    void loadAutomationRuns();
    void loadAutomationArtefacts();
    void loadProcessingIssues();
  });

  createEffect(() => {
    const current =
      reviewInboxItems().find((item) => item.key === state.selectedReviewInboxKey) ??
      reviewInboxItems()[0] ??
      null;
    const nextKey = current?.key ?? null;

    if (nextKey !== state.selectedReviewInboxKey) {
      setState("selectedReviewInboxKey", nextKey);
    }

    if (
      current?.kind === "artefact" &&
      current.artefact.id !== state.selectedAutomationArtefactId
    ) {
      applySelectedArtefactDrafts(current.artefact);
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
    void detachClient();
  });

  const onboardingState = () =>
    deriveOnboardingState({
      appState: state.appState,
      automationRuleCount: state.automationRules.length,
      harnesses: state.harnesses,
      meetingsLoadedCount: state.meetings.length,
      serverInfo: state.serverInfo,
    });

  const showOnboarding = () => !state.serverLocked && !onboardingState().complete;
  const searchResultsVisible = () => state.searchSubmitted && hasMeetingBrowseScope();
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

    const meeting = state.selectedMeeting.meeting;
    const folderLabel = meeting.folders.length
      ? meeting.folders.map((folder) => folder.name || folder.id).join(", ")
      : "No folder";
    const transcriptLabel = meeting.transcriptLoaded
      ? `${meeting.transcriptSegmentCount} transcript segments`
      : "Transcript not loaded yet";
    return `${meeting.updatedAt.slice(0, 10)} • ${folderLabel} • ${transcriptLabel}`;
  };
  const settingsTabs: Array<{ id: WebSettingsSection; label: string }> = [
    { id: "auth", label: "Auth" },
    { id: "pipelines", label: "Automation" },
    { id: "exports", label: "Exports" },
    { id: "diagnostics", label: "Diagnostics" },
  ];

  return (
    <Show
      when={!state.serverLocked && !showOnboarding()}
      fallback={
        <div class="shell shell--onboarding">
          <main class="pane detail detail--onboarding">
            <AppStatePanel
              appState={state.appState}
              heading="Home"
              reviewSummary={reviewInboxSummary()}
              serverInfo={state.serverInfo}
              statusLabel={state.statusLabel}
              statusTone={state.statusTone}
            />
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
                  void createStarterPipeline();
                }}
                onImportDesktopSession={() => {
                  void importDesktopSession();
                }}
                onRunSync={() => {
                  void connectAndRefresh(true);
                }}
                onSaveApiKey={() => {
                  void saveApiKey();
                }}
                onSelectProvider={(provider) => {
                  setState("preferredProvider", provider);
                }}
                preferredProvider={state.preferredProvider}
                state={onboardingState()}
              />
            ) : null}
            {!state.serverLocked && state.detailError ? (
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
          folderCount={state.folders.length}
          onNavigate={(page) => {
            if (page === "home") {
              void clearFilters();
              return;
            }

            void openPage(page);
          }}
          onSync={() => {
            void connectAndRefresh(true);
          }}
          reviewSummary={reviewInboxSummary()}
          statusLabel={state.statusLabel}
          statusTone={state.statusTone}
        />
        <main class="pane app-main">
          <Switch>
            <Match when={state.activePage === "home"}>
              <PageHeader
                actions={
                  <>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        void openPage("folders");
                      }}
                      type="button"
                    >
                      Open folders
                    </button>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        void openPage("search");
                      }}
                      type="button"
                    >
                      Search meetings
                    </button>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        void openPage("review");
                      }}
                      type="button"
                    >
                      Open review
                    </button>
                  </>
                }
                description="Start from one calm home view, then choose folders, search, review, or settings as separate tasks."
                eyebrow="Home"
                title="A quieter way to work through meetings"
              />
              <HomeDashboardPanel
                appState={state.appState}
                folders={state.folders}
                latestMeetings={state.homeMeetings}
                onOpenFolder={(folderId) => {
                  setState("selectedFolderId", folderId);
                  setState("selectedMeetingId", null);
                  setState("selectedMeeting", null);
                  setState("selectedMeetingBundle", null);
                  setState("activePage", "folders");
                  void loadMeetings();
                }}
                onOpenLatestMeeting={(meeting) => {
                  void openMeetingFromPage(meeting.id, "home", {
                    folderId: meeting.folders[0]?.id || null,
                  });
                }}
                onOpenMeeting={(meeting) => {
                  void openRecentMeeting(meeting.id, meeting.folderId);
                }}
                onOpenReview={() => {
                  void openPage("review");
                }}
                processingIssues={state.processingIssues}
                recentMeetings={state.recentMeetings}
                reviewSummary={reviewInboxSummary()}
                serverInfo={state.serverInfo}
              />
            </Match>
            <Match when={state.activePage === "folders"}>
              <PageHeader
                actions={
                  <>
                    <Show when={state.selectedFolderId}>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          setState("selectedFolderId", null);
                          setState("selectedMeetingId", null);
                          setState("selectedMeeting", null);
                          setState("selectedMeetingBundle", null);
                          setState("meetings", []);
                          setState("listError", "");
                        }}
                        type="button"
                      >
                        All folders
                      </button>
                    </Show>
                    <button
                      class="button button--secondary"
                      onClick={() => {
                        void loadFolders(true);
                      }}
                      type="button"
                    >
                      {state.selectedFolderId ? "Refresh folder" : "Refresh folders"}
                    </button>
                    <Show when={state.selectedFolderId}>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          void exportNotes();
                        }}
                        type="button"
                      >
                        Export folder notes
                      </button>
                      <button
                        class="button button--secondary"
                        onClick={() => {
                          void exportTranscripts();
                        }}
                        type="button"
                      >
                        Export folder transcripts
                      </button>
                    </Show>
                  </>
                }
                description={
                  selectedFolder()
                    ? `Open one meeting at a time from ${selectedFolder()?.name || selectedFolder()?.id}. Search and review stay on their own pages.`
                    : "Choose one folder first. The folders page should feel like a directory, not another split-screen browser."
                }
                eyebrow="Folders"
                title={selectedFolder()?.name || "Browse by folder"}
              />
              <Show
                when={state.selectedFolderId}
                fallback={
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
                }
              >
                <section class="folder-focus">
                  <div class="folder-focus__hero">
                    <div>
                      <p class="folder-focus__eyebrow">Selected folder</p>
                      <h3>{selectedFolder()?.name || selectedFolder()?.id || "Folder"}</h3>
                      <p>
                        {selectedFolder()?.isFavourite
                          ? "Marked as a favourite in Granola."
                          : "Use this focused list to choose one meeting without browsing the entire workspace."}
                      </p>
                    </div>
                    <div class="folder-focus__stats">
                      <div class="folder-focus__stat">
                        <span class="dashboard-stat__label">Meetings</span>
                        <strong>{String(selectedFolder()?.documentCount ?? 0)}</strong>
                      </div>
                      <div class="folder-focus__stat">
                        <span class="dashboard-stat__label">Updated</span>
                        <strong>
                          {selectedFolder()?.updatedAt
                            ? selectedFolder()?.updatedAt.slice(0, 10)
                            : "Unknown"}
                        </strong>
                      </div>
                    </div>
                  </div>
                </section>
                <MeetingList
                  description={
                    selectedFolder()
                      ? `${selectedFolder()?.documentCount ?? 0} meetings in ${selectedFolder()?.name || selectedFolder()?.id}.`
                      : "Choose a folder to load its meetings."
                  }
                  error={state.listError}
                  emptyHint={meetingEmptyHint()}
                  folders={state.folders}
                  heading={`Meetings in ${selectedFolder()?.name || "this folder"}`}
                  meetings={state.meetings}
                  onSelect={(meetingId) => {
                    void openMeetingFromPage(meetingId, "folders", {
                      folderId: state.selectedFolderId,
                    });
                  }}
                  search=""
                  selectedFolderId={state.selectedFolderId}
                  selectedMeetingId={state.selectedMeetingId}
                  updatedFrom=""
                  updatedTo=""
                />
              </Show>
            </Match>
            <Match when={state.activePage === "search"}>
              <PageHeader
                description="Search is its own page now, so folder browsing and meeting reading do not compete with a wall of search controls."
                eyebrow="Search"
                title="Search meetings on purpose"
              />
              <SearchWorkspacePanel
                advancedQuery={state.advancedSearchQuery}
                onAdvancedQueryChange={(value) => {
                  setState("advancedSearchQuery", value);
                }}
                onClear={() => {
                  void clearSearch();
                }}
                onOpenAdvanced={() => {
                  void openAdvancedMeeting();
                }}
                onQueryChange={(value) => {
                  setState("search", value.trim());
                  setState("searchSubmitted", false);
                }}
                onRun={() => {
                  void runSearch();
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
                sort={state.sort}
                updatedFrom={state.updatedFrom}
                updatedTo={state.updatedTo}
              />
              <Show
                when={searchResultsVisible()}
                fallback={
                  <BrowsePromptPanel
                    foldersAvailable={state.folders.length}
                    hasRecentMeetings={state.recentMeetings.length > 0}
                  />
                }
              >
                <MeetingList
                  description={
                    state.search
                      ? `Results for "${state.search}".`
                      : "Filtered results from your local meeting index."
                  }
                  error={state.listError}
                  emptyHint={meetingEmptyHint()}
                  folders={state.folders}
                  heading="Search results"
                  meetings={state.meetings}
                  onSelect={(meetingId) => {
                    void openMeetingFromPage(meetingId, "search");
                  }}
                  search={state.search}
                  selectedFolderId={state.selectedFolderId}
                  selectedMeetingId={state.selectedMeetingId}
                  updatedFrom={state.updatedFrom}
                  updatedTo={state.updatedTo}
                />
              </Show>
            </Match>
            <Match when={state.activePage === "review"}>
              <PageHeader
                actions={
                  <button
                    class="button button--secondary"
                    onClick={() => {
                      void connectAndRefresh(true);
                    }}
                    type="button"
                  >
                    Refresh review state
                  </button>
                }
                description="Review approvals, artefacts, and processing issues in one place instead of mixing them into the meeting page."
                eyebrow="Review"
                title="Review queue"
              />
              <div class="review-layout">
                <section class="review-layout__sidebar">
                  <ReviewInboxPanel
                    items={reviewInboxItems()}
                    onSelect={(key) => {
                      void selectReviewInboxItem(key);
                    }}
                    selectedKey={state.selectedReviewInboxKey}
                    summary={reviewInboxSummary()}
                  />
                </section>
                <section class="review-layout__main">
                  <Switch>
                    <Match when={selectedReviewInboxItem()?.kind === "issue"}>
                      <IssueReviewPanel
                        issue={selectedReviewIssue()}
                        onOpenMeeting={(meetingId) => {
                          void openMeetingFromPage(meetingId, "review");
                        }}
                        onRecover={(issueId) => {
                          void recoverProcessingIssue(issueId);
                        }}
                      />
                    </Match>
                    <Match when={selectedReviewInboxItem()?.kind === "run"}>
                      <RunReviewPanel
                        onApprove={(runId) => {
                          void resolveAutomationRun(runId, "approve");
                        }}
                        onOpenMeeting={(meetingId) => {
                          void openMeetingFromPage(meetingId, "review");
                        }}
                        onReject={(runId) => {
                          void resolveAutomationRun(runId, "reject");
                        }}
                        run={selectedReviewRun()}
                      />
                    </Match>
                    <Match when={selectedReviewInboxItem()?.kind === "artefact"}>
                      <ArtefactReviewPanel
                        artefact={selectedReviewArtefact()}
                        bundle={state.selectedMeetingBundle}
                        draftMarkdown={state.automationArtefactDraftMarkdown}
                        draftSummary={state.automationArtefactDraftSummary}
                        draftTitle={state.automationArtefactDraftTitle}
                        error={state.automationArtefactError}
                        onApprove={() => {
                          void resolveAutomationArtefact("approve");
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
                        onReject={() => {
                          void resolveAutomationArtefact("reject");
                        }}
                        onRerun={() => {
                          void rerunAutomationArtefact();
                        }}
                        onReviewNoteChange={(value) => {
                          setState("reviewNote", value);
                        }}
                        onSave={() => {
                          void saveAutomationArtefact();
                        }}
                        reviewNote={state.reviewNote}
                      />
                    </Match>
                    <Match when={true}>
                      <div class="empty">Select something from the review inbox to inspect it.</div>
                    </Match>
                  </Switch>
                </section>
              </div>
            </Match>
            <Match when={state.activePage === "settings"}>
              <PageHeader
                description="Settings holds auth, automation, export history, and diagnostics so the rest of the app can stay focused on browsing and reading."
                eyebrow="Settings"
                title="Service settings"
              />
              <section class="settings-shell">
                <nav class="settings-shell__tabs">
                  <For each={settingsTabs}>
                    {(tab) => (
                      <button
                        class="workspace-tab"
                        data-selected={state.settingsTab === tab.id ? "true" : undefined}
                        onClick={() => {
                          setState("settingsTab", tab.id);
                        }}
                        type="button"
                      >
                        {tab.label}
                      </button>
                    )}
                  </For>
                </nav>
                <div class="settings-shell__body">
                  <Switch>
                    <Match when={state.settingsTab === "auth"}>
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
                        preferredProvider={state.preferredProvider}
                      />
                    </Match>
                    <Match when={state.settingsTab === "pipelines"}>
                      <HarnessEditorPanel
                        dirty={state.harnessDirty}
                        error={state.harnessError}
                        explanations={state.harnessExplanations}
                        explanationEventKind={state.harnessExplainEventKind}
                        harnesses={state.harnesses}
                        onChange={updateHarness}
                        onDuplicate={duplicateHarness}
                        onNew={createHarness}
                        onReload={() => {
                          void reloadHarnesses();
                        }}
                        onRemove={removeHarness}
                        onSave={() => {
                          void saveHarnesses();
                        }}
                        onSelect={(id) => {
                          setState("selectedHarnessId", id);
                          setState("harnessTestResult", null);
                        }}
                        onTest={() => {
                          void testHarness();
                        }}
                        onTestKindChange={(kind) => {
                          setState("harnessTestKind", kind);
                        }}
                        selectedHarness={selectedHarness()}
                        selectedHarnessId={state.selectedHarnessId}
                        selectedMeeting={state.selectedMeeting}
                        testKind={state.harnessTestKind}
                        testResult={state.harnessTestResult}
                      />
                    </Match>
                    <Match when={state.settingsTab === "exports"}>
                      <section class="settings-export-actions">
                        <div class="toolbar-actions">
                          <button
                            class="button button--secondary"
                            onClick={() => {
                              void exportNotes();
                            }}
                            type="button"
                          >
                            Export notes
                          </button>
                          <button
                            class="button button--secondary"
                            onClick={() => {
                              void exportTranscripts();
                            }}
                            type="button"
                          >
                            Export transcripts
                          </button>
                        </div>
                      </section>
                      <ExportJobsPanel
                        jobs={state.appState?.exports.jobs || []}
                        onRerun={(jobId) => {
                          void rerunJob(jobId);
                        }}
                      />
                    </Match>
                    <Match when={state.settingsTab === "diagnostics"}>
                      <DiagnosticsPanel
                        appState={state.appState}
                        serverInfo={state.serverInfo}
                        statusLabel={state.statusLabel}
                      />
                      <ProcessingIssuesPanel
                        issues={state.processingIssues}
                        onOpenMeeting={(meetingId) => {
                          void openMeetingFromPage(meetingId, "settings");
                        }}
                        onRecover={(issueId) => {
                          void recoverProcessingIssue(issueId);
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
                    </Match>
                  </Switch>
                </div>
              </section>
            </Match>
            <Match when={state.activePage === "meeting"}>
              <PageHeader
                actions={
                  <button
                    class="button button--secondary"
                    onClick={() => {
                      setState("activePage", state.meetingReturnPage);
                    }}
                    type="button"
                  >
                    {meetingReturnLabel()}
                  </button>
                }
                description={meetingDescription()}
                eyebrow="Meeting"
                title={state.selectedMeeting?.meeting.title || state.selectedMeetingId || "Meeting"}
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
            </Match>
          </Switch>
        </main>
      </div>
    </Show>
  );
}
