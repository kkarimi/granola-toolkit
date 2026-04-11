import type { SetStoreFunction } from "solid-js/store";

import type { GranolaAppAuthMode, GranolaAppAuthState } from "../app/index.ts";
import { createGranolaServerClient, type GranolaServerClient } from "../server/client.ts";
import { granolaTransportPaths } from "../transport.ts";

import type { GranolaWebAppState } from "./types.ts";
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
