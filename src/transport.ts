import type {
  GranolaAutomationActionRunStatus,
  GranolaExportJobsListOptions,
  GranolaFolderListOptions,
  GranolaMeetingListOptions,
} from "./app/index.ts";
import type { GranolaToolkitSessionStoreKind } from "./persistence/layout.ts";

export const GRANOLA_TRANSPORT_PROTOCOL_VERSION = 2;

export interface GranolaServerInfo {
  capabilities: {
    attach: boolean;
    auth: boolean;
    automation: boolean;
    events: boolean;
    exports: boolean;
    folders: boolean;
    meetingOpen: boolean;
    sync: boolean;
    webClient: boolean;
  };
  persistence: {
    exportJobs: boolean;
    meetingIndex: boolean;
    sessionStore: GranolaToolkitSessionStoreKind;
    syncEvents: boolean;
    syncState: boolean;
  };
  product: "granola-toolkit";
  protocolVersion: number;
  transport: "local-http";
}

export const granolaTransportPaths = {
  authLock: "/auth/lock",
  authLogin: "/auth/login",
  authLogout: "/auth/logout",
  authMode: "/auth/mode",
  authRefresh: "/auth/refresh",
  authStatus: "/auth/status",
  authUnlock: "/auth/unlock",
  automationMatches: "/automation/matches",
  automationRules: "/automation/rules",
  automationRuns: "/automation/runs",
  events: "/events",
  exportJobs: "/exports/jobs",
  exportNotes: "/exports/notes",
  exportTranscripts: "/exports/transcripts",
  folderResolve: "/folders/resolve",
  folders: "/folders",
  health: "/health",
  meetingResolve: "/meetings/resolve",
  meetings: "/meetings",
  root: "/",
  serverInfo: "/server/info",
  syncRun: "/sync",
  syncEvents: "/sync/events",
  state: "/state",
} as const;

function appendSearchParams(
  path: string,
  params: Record<string, boolean | number | string | undefined>,
): string {
  const url = new URL(path, "http://localhost");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

export function granolaMeetingPath(id: string): string {
  return `${granolaTransportPaths.meetings}/${encodeURIComponent(id)}`;
}

export function granolaMeetingResolvePath(
  query: string,
  options: { includeTranscript?: boolean } = {},
): string {
  return appendSearchParams(granolaTransportPaths.meetingResolve, {
    includeTranscript: options.includeTranscript ? "true" : undefined,
    q: query,
  });
}

export function granolaMeetingsPath(options: GranolaMeetingListOptions = {}): string {
  return appendSearchParams(granolaTransportPaths.meetings, {
    folderId: options.folderId,
    limit: options.limit,
    refresh: options.forceRefresh ? "true" : undefined,
    search: options.search,
    sort: options.sort,
    updatedFrom: options.updatedFrom,
    updatedTo: options.updatedTo,
  });
}

export function granolaFolderPath(id: string): string {
  return `${granolaTransportPaths.folders}/${encodeURIComponent(id)}`;
}

export function granolaFolderResolvePath(query: string): string {
  return appendSearchParams(granolaTransportPaths.folderResolve, {
    q: query,
  });
}

export function granolaFoldersPath(options: GranolaFolderListOptions = {}): string {
  return appendSearchParams(granolaTransportPaths.folders, {
    limit: options.limit,
    refresh: options.forceRefresh ? "true" : undefined,
    search: options.search,
  });
}

export function granolaExportJobsPath(options: GranolaExportJobsListOptions = {}): string {
  return appendSearchParams(granolaTransportPaths.exportJobs, {
    limit: options.limit,
  });
}

export function granolaAutomationRunsPath(
  options: {
    limit?: number;
    status?: GranolaAutomationActionRunStatus;
  } = {},
): string {
  return appendSearchParams(granolaTransportPaths.automationRuns, {
    limit: options.limit,
    status: options.status,
  });
}

export function granolaAutomationRunDecisionPath(
  id: string,
  decision: "approve" | "reject",
): string {
  return `${granolaTransportPaths.automationRuns}/${encodeURIComponent(id)}/${decision}`;
}

export function granolaExportJobRerunPath(id: string): string {
  return `${granolaTransportPaths.exportJobs}/${encodeURIComponent(id)}/rerun`;
}
