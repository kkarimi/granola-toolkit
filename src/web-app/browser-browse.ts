import type { SetStoreFunction } from "solid-js/store";

import type { FolderSummaryRecord } from "../app/index.ts";
import type { GranolaServerClient } from "../server/client.ts";
import {
  hasScopedMeetingBrowse,
  rememberRecentMeeting,
  selectMeetingId,
  type WebWorkspacePreferences,
} from "../web/client-state.ts";

import type { WebStatusTone } from "./components.tsx";
import type { GranolaWebAppState, MeetingReturnPage } from "./types.ts";

interface WebBrowserHookDeps {
  setState: SetStoreFunction<GranolaWebAppState>;
  setStatus: (label: string, tone?: WebStatusTone) => void;
  state: GranolaWebAppState;
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
