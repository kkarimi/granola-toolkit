import { describe, expect, test } from "vite-plus/test";

import {
  applyWorkspaceFilter,
  buildBrowserUrlPath,
  buildMeetingsQuery,
  buildNotesExportRequest,
  buildTranscriptsExportRequest,
  currentFilterSummary,
  defaultWorkspacePreferences,
  describeAuthStatus,
  describeSyncStatus,
  exportScopeLabel,
  hasActiveFilters,
  nextWorkspaceTab,
  parseWorkspaceTab,
  parseWorkspacePreferences,
  rememberRecentMeeting,
  removeWorkspaceFilter,
  saveWorkspaceFilter,
  serialiseWorkspacePreferences,
  selectMeetingId,
  startupSelectionFromSearch,
} from "../src/web/client-state.ts";

describe("web client state helpers", () => {
  test("parses startup selection from the browser query string", () => {
    expect(
      startupSelectionFromSearch("?folder=folder-team-1111&meeting=doc-alpha-1111&tab=metadata"),
    ).toEqual({
      folderId: "folder-team-1111",
      meetingId: "doc-alpha-1111",
      workspaceTab: "metadata",
    });

    expect(startupSelectionFromSearch("?tab=unknown")).toEqual({
      folderId: "",
      meetingId: "",
      workspaceTab: "notes",
    });
  });

  test("builds browser URLs without leaving stale folder or tab state behind", () => {
    expect(
      buildBrowserUrlPath("https://kkarimi.github.io/granola-toolkit/docs/?foo=bar#workspace", {
        selectedFolderId: "folder-sales-2222",
        selectedMeetingId: "doc-bravo-2222",
        workspaceTab: "transcript",
      }),
    ).toBe(
      "/granola-toolkit/docs/?foo=bar&folder=folder-sales-2222&meeting=doc-bravo-2222&tab=transcript#workspace",
    );

    expect(
      buildBrowserUrlPath(
        "https://kkarimi.github.io/granola-toolkit/docs/?folder=old&meeting=old&tab=raw",
        {
          selectedFolderId: null,
          selectedMeetingId: null,
          workspaceTab: "notes",
        },
      ),
    ).toBe("/granola-toolkit/docs/");
  });

  test("summarises filters and keeps the selected meeting only when still visible", () => {
    expect(
      currentFilterSummary({
        folders: [{ id: "folder-team-1111", name: "Team" }],
        search: "alpha",
        selectedFolderId: "folder-team-1111",
        updatedFrom: "2026-04-01",
        updatedTo: "2026-04-04",
      }),
    ).toBe('folder "Team", search "alpha", from 2026-04-01, to 2026-04-04');

    expect(
      selectMeetingId([{ id: "doc-alpha-1111" }, { id: "doc-bravo-2222" }], "doc-bravo-2222"),
    ).toBe("doc-bravo-2222");
    expect(selectMeetingId([{ id: "doc-bravo-2222" }], "doc-alpha-1111")).toBe("doc-bravo-2222");
    expect(selectMeetingId([], "doc-alpha-1111")).toBeNull();
  });

  test("builds scope-aware meeting queries and export payloads", () => {
    expect(
      buildMeetingsQuery(
        {
          search: "alpha",
          selectedFolderId: "folder-team-1111",
          sort: "updated-asc",
          updatedFrom: "2026-04-01",
          updatedTo: "2026-04-04",
        },
        {
          limit: 25,
          refresh: true,
        },
      ),
    ).toBe(
      "?limit=25&sort=updated-asc&search=alpha&updatedFrom=2026-04-01&updatedTo=2026-04-04&folderId=folder-team-1111&refresh=true",
    );

    expect(buildNotesExportRequest("folder-team-1111")).toEqual({
      folderId: "folder-team-1111",
      format: "markdown",
    });
    expect(buildNotesExportRequest(null)).toEqual({
      folderId: undefined,
      format: "markdown",
    });
    expect(buildTranscriptsExportRequest("folder-team-1111")).toEqual({
      folderId: "folder-team-1111",
      format: "text",
    });
  });

  test("resolves workspace tabs and scope labels consistently", () => {
    expect(parseWorkspaceTab("transcript")).toBe("transcript");
    expect(parseWorkspaceTab("unknown")).toBe("notes");

    expect(nextWorkspaceTab("notes", "2")).toBe("transcript");
    expect(nextWorkspaceTab("metadata", "]")).toBe("raw");
    expect(nextWorkspaceTab("notes", "[")).toBe("raw");
    expect(nextWorkspaceTab("transcript", "x")).toBeUndefined();

    expect(
      exportScopeLabel({ mode: "folder", folderName: "Team", folderId: "folder-team-1111" }),
    ).toBe("Folder: Team");
    expect(exportScopeLabel({ mode: "all" })).toBe("Scope: All meetings");
  });

  test("persists saved filters and recent meetings for the workspace", () => {
    const initial = defaultWorkspacePreferences();
    const withRecent = rememberRecentMeeting(initial, {
      folders: [{ id: "folder-team-1111" }],
      id: "doc-alpha-1111",
      title: "Alpha Sync",
      updatedAt: "2026-04-04T20:00:00Z",
    });
    const withFilter = saveWorkspaceFilter(withRecent, {
      folders: [{ id: "folder-team-1111", name: "Team" }],
      search: "alpha",
      selectedFolderId: "folder-team-1111",
      sort: "updated-asc",
      updatedFrom: "2026-04-01",
      updatedTo: "2026-04-04",
    });
    const roundTripped = parseWorkspacePreferences(serialiseWorkspacePreferences(withFilter));

    expect(roundTripped.recentMeetings[0]?.id).toBe("doc-alpha-1111");
    expect(roundTripped.savedFilters[0]?.label).toContain('folder "Team"');
    expect(hasActiveFilters(roundTripped.savedFilters[0]?.filters ?? {})).toBe(true);
    expect(applyWorkspaceFilter(roundTripped.savedFilters[0]!)).toEqual({
      search: "alpha",
      selectedFolderId: "folder-team-1111",
      sort: "updated-asc",
      updatedFrom: "2026-04-01",
      updatedTo: "2026-04-04",
    });
    expect(
      removeWorkspaceFilter(roundTripped, roundTripped.savedFilters[0]!.id).savedFilters,
    ).toHaveLength(0);
  });

  test("describes auth and sync status in user-facing language", () => {
    expect(describeAuthStatus({ mode: "api-key" })).toBe("Personal API key active");
    expect(describeAuthStatus({ lastError: "bad token", mode: "stored-session" })).toBe(
      "Auth needs attention",
    );
    expect(
      describeSyncStatus({
        lastCompletedAt: "2026-04-04T20:11:12Z",
        summary: { changedCount: 3 },
      }),
    ).toBe("Synced 20:11:12 · 3 changes");
    expect(describeSyncStatus({ lastError: "boom" })).toBe("Sync needs attention");
  });
});
