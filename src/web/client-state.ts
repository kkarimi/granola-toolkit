export type WorkspaceTab = "metadata" | "notes" | "raw" | "transcript";

interface FolderLike {
  id: string;
  name?: string;
}

interface MeetingLike {
  id: string;
}

interface ScopeLike {
  folderId?: string;
  folderName?: string;
  mode?: string;
}

interface WebClientSelection {
  selectedFolderId?: string | null;
  selectedMeetingId?: string | null;
  workspaceTab?: string | null;
}

interface WebClientFilters {
  search?: string;
  selectedFolderId?: string | null;
  sort?: string;
  updatedFrom?: string;
  updatedTo?: string;
}

export function parseWorkspaceTab(value: string | null | undefined): WorkspaceTab {
  switch (value) {
    case "metadata":
    case "raw":
    case "transcript":
      return value;
    case "notes":
    default:
      return "notes";
  }
}

export function startupSelectionFromSearch(search: string): {
  folderId: string;
  meetingId: string;
  workspaceTab: WorkspaceTab;
} {
  const params = new URLSearchParams(search);
  return {
    folderId: params.get("folder")?.trim() || "",
    meetingId: params.get("meeting")?.trim() || "",
    workspaceTab: parseWorkspaceTab(params.get("tab")),
  };
}

export function buildBrowserUrlPath(currentHref: string, selection: WebClientSelection): string {
  const url = new URL(currentHref);

  if (selection.selectedFolderId) {
    url.searchParams.set("folder", selection.selectedFolderId);
  } else {
    url.searchParams.delete("folder");
  }

  if (selection.selectedMeetingId) {
    url.searchParams.set("meeting", selection.selectedMeetingId);
  } else {
    url.searchParams.delete("meeting");
  }

  if (parseWorkspaceTab(selection.workspaceTab) !== "notes") {
    url.searchParams.set("tab", parseWorkspaceTab(selection.workspaceTab));
  } else {
    url.searchParams.delete("tab");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function exportScopeLabel(scope: ScopeLike | null | undefined): string {
  return scope && scope.mode === "folder"
    ? `Folder: ${scope.folderName || scope.folderId}`
    : "Scope: All meetings";
}

export function currentFilterSummary(
  filters: WebClientFilters & { folders: FolderLike[] },
): string {
  const parts: string[] = [];

  if (filters.selectedFolderId) {
    const folder = filters.folders.find((candidate) => candidate.id === filters.selectedFolderId);
    parts.push(`folder "${folder ? folder.name : filters.selectedFolderId}"`);
  }

  if (filters.search) {
    parts.push(`search "${filters.search}"`);
  }

  if (filters.updatedFrom) {
    parts.push(`from ${filters.updatedFrom}`);
  }

  if (filters.updatedTo) {
    parts.push(`to ${filters.updatedTo}`);
  }

  return parts.join(", ");
}

export function selectMeetingId(
  meetings: MeetingLike[],
  selectedMeetingId: string | null | undefined,
): string | null {
  if (selectedMeetingId && meetings.some((meeting) => meeting.id === selectedMeetingId)) {
    return selectedMeetingId;
  }

  return meetings[0]?.id ?? null;
}

export function buildMeetingsQuery(
  filters: WebClientFilters,
  options: { limit?: number; refresh?: boolean } = {},
): string {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 100));
  params.set("sort", filters.sort || "updated-desc");

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.updatedFrom) {
    params.set("updatedFrom", filters.updatedFrom);
  }

  if (filters.updatedTo) {
    params.set("updatedTo", filters.updatedTo);
  }

  if (filters.selectedFolderId) {
    params.set("folderId", filters.selectedFolderId);
  }

  if (options.refresh) {
    params.set("refresh", "true");
  }

  return `?${params.toString()}`;
}

export function buildNotesExportRequest(selectedFolderId?: string | null): {
  folderId?: string;
  format: "markdown";
} {
  return {
    folderId: selectedFolderId || undefined,
    format: "markdown",
  };
}

export function buildTranscriptsExportRequest(selectedFolderId?: string | null): {
  folderId?: string;
  format: "text";
} {
  return {
    folderId: selectedFolderId || undefined,
    format: "text",
  };
}

export function nextWorkspaceTab(
  currentTab: string | null | undefined,
  key: string,
): WorkspaceTab | undefined {
  const current = parseWorkspaceTab(currentTab);

  switch (key) {
    case "1":
      return "notes";
    case "2":
      return "transcript";
    case "3":
      return "metadata";
    case "4":
      return "raw";
    case "]":
      switch (current) {
        case "notes":
          return "transcript";
        case "transcript":
          return "metadata";
        case "metadata":
          return "raw";
        case "raw":
          return "notes";
      }
      break;
    case "[":
      switch (current) {
        case "notes":
          return "raw";
        case "transcript":
          return "notes";
        case "metadata":
          return "transcript";
        case "raw":
          return "metadata";
      }
      break;
    default:
      return undefined;
  }
}
