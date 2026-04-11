import type { SetStoreFunction } from "solid-js/store";

import type {
  FolderSummaryRecord,
  GranolaAgentHarness,
  GranolaAppAuthMode,
  GranolaAppAuthState,
} from "../app/index.ts";
import { createGranolaServerClient, type GranolaServerClient } from "../server/client.ts";
import { granolaTransportPaths } from "../transport.ts";
import {
  hasScopedMeetingBrowse,
  rememberRecentMeeting,
  selectMeetingId,
  type WebWorkspacePreferences,
} from "../web/client-state.ts";

import { createHarnessTemplate, duplicateHarnessTemplate } from "./harness-editor.tsx";
import { buildStarterPipeline } from "./onboarding.tsx";
import type { GranolaWebAppState, GranolaWebBrowserConfig, MeetingReturnPage } from "./types.ts";
import type { WebStatusTone } from "./components.tsx";

interface WebBrowserHookDeps {
  setState: SetStoreFunction<GranolaWebAppState>;
  setStatus: (label: string, tone?: WebStatusTone) => void;
  state: GranolaWebAppState;
}

interface WebClientControllerDeps extends WebBrowserHookDeps {
  origin: string;
}

interface WebClientController {
  attachClient: () => Promise<void>;
  clientAccessor: () => GranolaServerClient | null;
  clearApiKey: (refreshAll: () => Promise<void>) => Promise<void>;
  detachClient: () => Promise<void>;
  importDesktopSession: () => Promise<void>;
  lockServer: () => Promise<void>;
  logout: (refreshAll: () => Promise<void>) => Promise<void>;
  mergeAuthState: (authState?: GranolaAppAuthState) => Promise<void>;
  refreshAuth: (refreshAll: () => Promise<void>) => Promise<void>;
  saveApiKey: () => Promise<void>;
  switchAuthMode: (mode: GranolaAppAuthMode, refreshAll: () => Promise<void>) => Promise<void>;
  unlockServer: (connectAndRefresh: (forceRefresh?: boolean) => Promise<void>) => Promise<void>;
}

interface WebHarnessControllerDeps extends WebBrowserHookDeps {
  clientAccessor: () => GranolaServerClient | null;
}

interface WebBrowserControllerDeps extends WebBrowserHookDeps {
  clientAccessor: () => GranolaServerClient | null;
  loadAutomationArtefacts: (options?: {
    preferredId?: string | null;
    preferredMeetingId?: string | null;
  }) => Promise<void>;
  loadHarnessExplanations: (meetingId: string | null) => Promise<void>;
  loadReviewPanels: () => Promise<void>;
  updatePreferences: (
    updater: (preferences: WebWorkspacePreferences) => WebWorkspacePreferences,
  ) => void;
}

export function browserConfig(): GranolaWebBrowserConfig {
  return {
    passwordRequired: Boolean(window.__GRANOLA_SERVER__?.passwordRequired),
  };
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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

export function useWebClientController({
  origin,
  setState,
  setStatus,
  state,
}: WebClientControllerDeps): WebClientController {
  let client: GranolaServerClient | null = null;
  let unsubscribe: (() => void) | undefined;

  const clientAccessor = () => client;

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
    client = await createGranolaServerClient(origin);
    setState("serverInfo", client.info);
    setState("appState", client.getState());
    unsubscribe = client.subscribe((event) => {
      setState("appState", event.state);
    });
    await mergeAuthState();
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

  const clearApiKey = async (refreshAll: () => Promise<void>) => {
    setStatus("Removing saved API key…", "busy");
    try {
      const auth = await requestJson<GranolaAppAuthState>(granolaTransportPaths.authApiKeyClear, {
        method: "POST",
      });
      setState("apiKeyDraft", "");
      setState("detailError", "");
      await mergeAuthState(auth);
      await refreshAll();
      setStatus("Saved API key removed", "ok");
    } catch (error) {
      await mergeAuthState();
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("API key removal failed", "error");
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

  const refreshAuth = async (refreshAll: () => Promise<void>) => {
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

  const switchAuthMode = async (mode: GranolaAppAuthMode, refreshAll: () => Promise<void>) => {
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

  const logout = async (refreshAll: () => Promise<void>) => {
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

  const unlockServer = async (connectAndRefresh: (forceRefresh?: boolean) => Promise<void>) => {
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

  return {
    attachClient,
    clientAccessor,
    clearApiKey,
    detachClient,
    importDesktopSession,
    lockServer,
    logout,
    mergeAuthState,
    refreshAuth,
    saveApiKey,
    switchAuthMode,
    unlockServer,
  };
}
export function useHarnessController({
  clientAccessor,
  setState,
  setStatus,
  state,
}: WebHarnessControllerDeps) {
  const selectHarnessId = (harnesses: GranolaAgentHarness[], preferredId?: string | null) => {
    if (preferredId && harnesses.some((harness) => harness.id === preferredId)) {
      return preferredId;
    }

    return harnesses[0]?.id ?? null;
  };

  const selectedHarness = () =>
    state.harnesses.find((harness) => harness.id === state.selectedHarnessId) ?? null;

  const loadHarnessExplanations = async (meetingId: string | null) => {
    const client = clientAccessor();
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
    const client = clientAccessor();
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
    const client = clientAccessor();
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

  const createStarterPipeline = async (refreshAll: () => Promise<void>) => {
    const client = clientAccessor();
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
    const client = clientAccessor();
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
        state.selectedMeetingBundle?.source.document.id === meetingId
          ? state.selectedMeetingBundle
          : await client.getMeeting(meetingId, { requireCache: true });
      const result = await client.evaluateAutomationCases(
        [
          {
            bundle,
            id: `web:${meetingId}`,
            title:
              bundle.meeting.meeting.title ||
              bundle.source.document.title ||
              bundle.source.document.id,
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

  return {
    createHarness,
    createStarterPipeline,
    duplicateHarness,
    loadHarnessExplanations,
    loadHarnesses,
    reloadHarnesses,
    removeHarness,
    saveHarnesses,
    selectedHarness,
    testHarness,
    updateHarness,
  };
}

export function useMeetingBrowserController({
  clientAccessor,
  loadAutomationArtefacts,
  loadHarnessExplanations,
  loadReviewPanels,
  setState,
  setStatus,
  state,
  updatePreferences,
}: WebBrowserControllerDeps) {
  const loadFolders = async (refresh = false) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    setState("foldersLoading", true);
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
      if (state.folders.length === 0) {
        setState("selectedFolderId", null);
      }
    } finally {
      setState("foldersLoading", false);
    }
  };

  const loadHomeMeetings = async (refresh = false) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    setState("homeMeetingsLoading", true);
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
    } finally {
      setState("homeMeetingsLoading", false);
    }
  };

  const loadMeeting = async (meetingId: string) => {
    const client = clientAccessor();
    if (!client) {
      return;
    }

    const previousMeetingId =
      state.selectedMeetingBundle?.source.document.id || state.selectedMeeting?.meeting.id || null;
    setState("selectedMeetingId", meetingId);
    setState("meetingLoading", true);
    if (previousMeetingId !== meetingId) {
      setState("selectedMeetingBundle", null);
      setState("selectedMeeting", null);
    }
    try {
      setState("detailError", "");
      const bundle = await client.getMeeting(meetingId);
      setState("selectedMeetingBundle", bundle);
      setState("selectedMeeting", bundle.meeting);
      updatePreferences((preferences) =>
        rememberRecentMeeting(preferences, bundle.meeting.meeting),
      );
      await loadHarnessExplanations(bundle.source.document.id);
      await loadAutomationArtefacts({
        preferredId: state.selectedAutomationArtefactId,
        preferredMeetingId: bundle.source.document.id,
      });
    } catch (error) {
      setState("selectedMeetingBundle", null);
      setState("selectedMeeting", null);
      setState("detailError", error instanceof Error ? error.message : String(error));
      setState("harnessExplainEventKind", null);
      setState("harnessExplanations", []);
    } finally {
      setState("meetingLoading", false);
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
    const client = clientAccessor();
    if (!client) {
      return;
    }

    if (!hasMeetingBrowseScope() && !options.preferredMeetingId && !state.selectedMeetingId) {
      setState("listError", "");
      setState("meetings", []);
      setState("meetingsLoading", false);
      setState("meetingLoading", false);
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

    setState("meetingsLoading", true);
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
        setState("meetingLoading", false);
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
      setState("meetingLoading", false);
    } finally {
      setState("meetingsLoading", false);
    }
  };

  const openPage = async (
    page: MeetingReturnPage,
    options?: {
      folderId?: string | null;
    },
  ) => {
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
      setState("selectedFolderId", options?.folderId ?? null);
      setState("selectedMeetingId", null);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("meetingLoading", false);
      setState("meetings", []);
      setState("listError", "");
      if (state.folders.length === 0) {
        await loadFolders(true);
      }
      if (options?.folderId) {
        await loadMeetings();
      }
      return;
    }

    if (page === "search") {
      setState("activePage", "search");
      setState("selectedFolderId", null);
      setState("selectedMeetingId", null);
      setState("selectedMeeting", null);
      setState("selectedMeetingBundle", null);
      setState("meetingLoading", false);
      setState("searchSubmitted", false);
      setState("meetings", []);
      setState("listError", "");
      return;
    }

    if (page === "review") {
      setState("activePage", "review");
      await loadReviewPanels();
      return;
    }

    setState("activePage", "settings");
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
    const client = clientAccessor();
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
      await openMeetingFromPage(bundle.source.document.id, "search", {
        folderId: bundle.meeting.meeting.folders[0]?.id || null,
      });
      setStatus("Meeting opened", "ok");
    } catch (error) {
      setState("detailError", error instanceof Error ? error.message : String(error));
      setStatus("Advanced search failed", "error");
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
    setState("meetingLoading", false);
    setState("searchSubmitted", false);
    setState("activePage", "home");
    await loadMeetings();
    setStatus("Back at home", "ok");
  };

  const runSearch = async () => {
    setState("activePage", "search");
    setState("searchSubmitted", true);
    setState("selectedMeetingId", null);
    setState("selectedMeeting", null);
    setState("selectedMeetingBundle", null);
    setState("meetingLoading", false);
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
    setState("meetingLoading", false);
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

  const openRecentMeeting = async (meetingId: string, folderId?: string) => {
    await openMeetingFromPage(meetingId, folderId ? "folders" : "home", {
      folderId: folderId || null,
    });
  };

  const selectedFolder = (): FolderSummaryRecord | null =>
    state.folders.find((folder) => folder.id === state.selectedFolderId) ?? null;

  return {
    clearFilters,
    clearSearch,
    hasMeetingBrowseScope,
    loadFolders,
    loadHomeMeetings,
    loadMeeting,
    loadMeetings,
    meetingEmptyHint,
    openAdvancedMeeting,
    openMeetingFromPage,
    openPage,
    openRecentMeeting,
    runSearch,
    selectedFolder,
  };
}
