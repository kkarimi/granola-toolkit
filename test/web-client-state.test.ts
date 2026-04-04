import { describe, expect, test } from "vite-plus/test";

import {
  buildBrowserUrlPath,
  buildMeetingsQuery,
  buildNotesExportRequest,
  buildTranscriptsExportRequest,
  currentFilterSummary,
  exportScopeLabel,
  nextWorkspaceTab,
  parseWorkspaceTab,
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
});
