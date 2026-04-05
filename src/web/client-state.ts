export type WorkspaceTab = "metadata" | "notes" | "raw" | "transcript";
export const granolaWebWorkspaceStorageKey = "granola-toolkit.web-workspace";
const maxRecentMeetings = 6;
const maxSavedFilters = 6;

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

export interface WebWorkspaceRecentMeeting {
  folderId?: string;
  id: string;
  title: string;
  updatedAt: string;
}

export interface WebWorkspaceSavedFilter {
  filters: {
    search?: string;
    selectedFolderId?: string | null;
    sort?: string;
    updatedFrom?: string;
    updatedTo?: string;
  };
  id: string;
  label: string;
}

export interface WebWorkspacePreferences {
  recentMeetings: WebWorkspaceRecentMeeting[];
  savedFilters: WebWorkspaceSavedFilter[];
}

function normaliseFilterValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normaliseFilters(filters: WebClientFilters): WebWorkspaceSavedFilter["filters"] {
  const selectedFolderId = normaliseFilterValue(filters.selectedFolderId);

  return {
    search: normaliseFilterValue(filters.search),
    selectedFolderId,
    sort: normaliseFilterValue(filters.sort) ?? "updated-desc",
    updatedFrom: normaliseFilterValue(filters.updatedFrom),
    updatedTo: normaliseFilterValue(filters.updatedTo),
  };
}

function filtersKey(filters: WebWorkspaceSavedFilter["filters"]): string {
  return JSON.stringify(normaliseFilters(filters));
}

export function defaultWorkspacePreferences(): WebWorkspacePreferences {
  return {
    recentMeetings: [],
    savedFilters: [],
  };
}

export function parseWorkspacePreferences(raw: string | null | undefined): WebWorkspacePreferences {
  if (!raw) {
    return defaultWorkspacePreferences();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WebWorkspacePreferences> | null;
    const recentMeetings = Array.isArray(parsed?.recentMeetings)
      ? parsed.recentMeetings
          .map((entry) => ({
            folderId: normaliseFilterValue(entry?.folderId),
            id: normaliseFilterValue(entry?.id) || "",
            title: normaliseFilterValue(entry?.title) || "",
            updatedAt: normaliseFilterValue(entry?.updatedAt) || "",
          }))
          .filter((entry) => entry.id && entry.title)
          .slice(0, maxRecentMeetings)
      : [];
    const savedFilters = Array.isArray(parsed?.savedFilters)
      ? parsed.savedFilters
          .map((preset) => ({
            filters: normaliseFilters(preset?.filters ?? {}),
            id: normaliseFilterValue(preset?.id) || "",
            label: normaliseFilterValue(preset?.label) || "",
          }))
          .filter((preset) => preset.id && preset.label)
          .slice(0, maxSavedFilters)
      : [];

    return {
      recentMeetings,
      savedFilters,
    };
  } catch {
    return defaultWorkspacePreferences();
  }
}

export function serialiseWorkspacePreferences(preferences: WebWorkspacePreferences): string {
  return JSON.stringify({
    recentMeetings: preferences.recentMeetings.slice(0, maxRecentMeetings),
    savedFilters: preferences.savedFilters.slice(0, maxSavedFilters),
  });
}

export function hasActiveFilters(filters: WebClientFilters): boolean {
  const normalised = normaliseFilters(filters);
  return Boolean(
    normalised.search ||
    normalised.selectedFolderId ||
    normalised.updatedFrom ||
    normalised.updatedTo ||
    normalised.sort !== "updated-desc",
  );
}

function filterLabel(filters: WebClientFilters & { folders: FolderLike[] }): string {
  const summary = currentFilterSummary(filters);
  if (!summary) {
    return "Current workspace";
  }

  return summary;
}

export function rememberRecentMeeting(
  preferences: WebWorkspacePreferences,
  meeting: {
    folders?: Array<{ id: string }>;
    id: string;
    title?: string;
    updatedAt: string;
  },
): WebWorkspacePreferences {
  const nextEntry: WebWorkspaceRecentMeeting = {
    folderId: meeting.folders?.[0]?.id,
    id: meeting.id,
    title: meeting.title?.trim() || meeting.id,
    updatedAt: meeting.updatedAt,
  };

  return {
    ...preferences,
    recentMeetings: [
      nextEntry,
      ...preferences.recentMeetings.filter((entry) => entry.id !== nextEntry.id),
    ].slice(0, maxRecentMeetings),
  };
}

export function saveWorkspaceFilter(
  preferences: WebWorkspacePreferences,
  filters: WebClientFilters & { folders: FolderLike[] },
  options: { idFactory?: () => string } = {},
): WebWorkspacePreferences {
  const nextFilters = normaliseFilters(filters);
  if (!hasActiveFilters(nextFilters)) {
    return preferences;
  }

  const key = filtersKey(nextFilters);
  const existing = preferences.savedFilters.find((preset) => filtersKey(preset.filters) === key);
  const nextPreset: WebWorkspaceSavedFilter = {
    filters: nextFilters,
    id: existing?.id ?? options.idFactory?.() ?? `filter-${preferences.savedFilters.length + 1}`,
    label: filterLabel(filters),
  };

  return {
    ...preferences,
    savedFilters: [
      nextPreset,
      ...preferences.savedFilters.filter((preset) => preset.id !== nextPreset.id),
    ].slice(0, maxSavedFilters),
  };
}

export function removeWorkspaceFilter(
  preferences: WebWorkspacePreferences,
  id: string,
): WebWorkspacePreferences {
  return {
    ...preferences,
    savedFilters: preferences.savedFilters.filter((preset) => preset.id !== id),
  };
}

export function applyWorkspaceFilter(preset: WebWorkspaceSavedFilter): Required<
  Omit<WebWorkspaceSavedFilter["filters"], "selectedFolderId">
> & {
  selectedFolderId: string | null;
} {
  return {
    search: preset.filters.search ?? "",
    selectedFolderId: preset.filters.selectedFolderId ?? null,
    sort: preset.filters.sort ?? "updated-desc",
    updatedFrom: preset.filters.updatedFrom ?? "",
    updatedTo: preset.filters.updatedTo ?? "",
  };
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

  if (filters.sort && filters.sort !== "updated-desc") {
    parts.push(
      filters.sort === "updated-asc"
        ? "oldest first"
        : filters.sort === "title-asc"
          ? "title A-Z"
          : "title Z-A",
    );
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

export function describeSyncStatus(sync: {
  lastCompletedAt?: string;
  lastError?: string;
  running?: boolean;
  summary?: { changedCount?: number };
}): string {
  if (sync.running) {
    return "Sync running";
  }

  if (sync.lastError) {
    return "Sync needs attention";
  }

  if (sync.lastCompletedAt) {
    const suffix = sync.summary?.changedCount ? ` · ${sync.summary.changedCount} changes` : "";
    return `Synced ${sync.lastCompletedAt.slice(11, 19)}${suffix}`;
  }

  return "Sync idle";
}

export function describeAuthStatus(auth?: {
  lastError?: string;
  mode?: "api-key" | "stored-session" | "supabase-file";
}): string {
  if (!auth) {
    return "Waiting for auth";
  }

  if (auth.lastError) {
    return "Auth needs attention";
  }

  switch (auth.mode) {
    case "api-key":
      return "Personal API key active";
    case "stored-session":
      return "Stored session active";
    default:
      return "supabase.json fallback active";
  }
}
