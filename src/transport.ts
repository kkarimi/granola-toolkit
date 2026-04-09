import type {
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactStatus,
  GranolaAutomationActionRunStatus,
  GranolaExportJobsListOptions,
  GranolaFolderListOptions,
  GranolaMeetingListOptions,
  GranolaProcessingIssueSeverity,
} from "./app/index.ts";
import type { GranolaToolkitSessionStoreKind } from "./persistence/layout.ts";

export const GRANOLA_TRANSPORT_PROTOCOL_VERSION = 5;

export type GranolaServerRuntimeMode = "background-service" | "server" | "web-workspace";

export interface GranolaLocalPathInfo {
  exists: boolean;
  kind: "directory" | "file";
  path: string;
  sizeBytes?: number;
  updatedAt?: string;
}

export interface GranolaServerInfo {
  build: {
    gitCommit?: string;
    gitCommitShort?: string;
    packageName: string;
    repositoryUrl?: string;
    version: string;
  };
  config: {
    automationRulesFile?: string;
    configFile?: string;
    exportTargetsFile?: string;
    notesOutputDir?: string;
    pkmTargetsFile?: string;
    pluginsFile?: string;
    supabaseFile?: string;
    transcriptCacheFile?: string;
    transcriptsOutputDir?: string;
  };
  capabilities: {
    attach: boolean;
    auth: boolean;
    automation: boolean;
    events: boolean;
    exports: boolean;
    folders: boolean;
    meetingOpen: boolean;
    plugins: boolean;
    processing: boolean;
    sync: boolean;
    webClient: boolean;
  };
  files?: {
    automationRules?: GranolaLocalPathInfo;
    catalogSnapshot?: GranolaLocalPathInfo;
    config?: GranolaLocalPathInfo;
    dataDirectory?: GranolaLocalPathInfo;
    meetingIndex?: GranolaLocalPathInfo;
    exportTargets?: GranolaLocalPathInfo;
    pluginSettings?: GranolaLocalPathInfo;
    pkmTargets?: GranolaLocalPathInfo;
    serviceLog?: GranolaLocalPathInfo;
    session?: GranolaLocalPathInfo;
    syncEvents?: GranolaLocalPathInfo;
    syncState?: GranolaLocalPathInfo;
    transcriptCache?: GranolaLocalPathInfo;
  };
  persistence: {
    catalogSnapshotFile?: string;
    dataDirectory?: string;
    exportJobs: boolean;
    exportJobsFile?: string;
    exportTargetsFile?: string;
    meetingIndex: boolean;
    meetingIndexFile?: string;
    pkmTargetsFile?: string;
    searchIndexFile?: string;
    sessionStore: GranolaToolkitSessionStoreKind;
    sessionFile?: string;
    serviceLogFile?: string;
    serviceStateFile?: string;
    syncEvents: boolean;
    syncEventsFile?: string;
    syncState: boolean;
    syncStateFile?: string;
  };
  product: "gran";
  protocolVersion: number;
  runtime: {
    mode: GranolaServerRuntimeMode;
    startedAt: string;
    syncEnabled: boolean;
    syncIntervalMs?: number;
  };
  transport: "local-http";
}

export const granolaTransportPaths = {
  authApiKeyClear: "/auth/api-key/clear",
  authLock: "/auth/lock",
  authLogin: "/auth/login",
  authLogout: "/auth/logout",
  authMode: "/auth/mode",
  authRefresh: "/auth/refresh",
  authStatus: "/auth/status",
  authUnlock: "/auth/unlock",
  automationEvaluate: "/automation/evaluate",
  automationHarnesses: "/automation/harnesses",
  automationHarnessExplain: "/automation/harnesses/explain",
  automationMatches: "/automation/matches",
  automationArtefacts: "/automation/artefacts",
  automationPkmTargets: "/automation/pkm-targets",
  automationRules: "/automation/rules",
  automationRuns: "/automation/runs",
  events: "/events",
  exportJobs: "/exports/jobs",
  exportNotes: "/exports/notes",
  exportTargets: "/exports/targets",
  exportTranscripts: "/exports/transcripts",
  folderResolve: "/folders/resolve",
  folders: "/folders",
  health: "/health",
  meetingResolve: "/meetings/resolve",
  meetings: "/meetings",
  plugins: "/plugins",
  processingIssues: "/processing/issues",
  root: "/",
  serverInfo: "/server/info",
  syncRun: "/sync",
  syncEvents: "/sync/events",
  state: "/state",
  yazdSource: "/yazd/source",
  yazdSourceChanges: "/yazd/source/changes",
  yazdSourceItems: "/yazd/source/items",
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

export function granolaYazdSourceItemPath(id: string): string {
  return `${granolaTransportPaths.yazdSourceItems}/${encodeURIComponent(id)}`;
}

export function granolaYazdSourceArtifactsPath(id: string): string {
  return `${granolaYazdSourceItemPath(id)}/artifacts`;
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

export function granolaYazdSourceItemsPath(
  options: {
    cursor?: string;
    folderId?: string;
    limit?: number;
    search?: string;
    since?: string;
  } = {},
): string {
  return appendSearchParams(granolaTransportPaths.yazdSourceItems, {
    cursor: options.cursor,
    folderId: options.folderId,
    limit: options.limit,
    search: options.search,
    since: options.since,
  });
}

export function granolaYazdSourceChangesPath(
  options: {
    cursor?: string;
    limit?: number;
    since?: string;
  } = {},
): string {
  return appendSearchParams(granolaTransportPaths.yazdSourceChanges, {
    cursor: options.cursor,
    limit: options.limit,
    since: options.since,
  });
}

export function granolaFolderPath(id: string): string {
  return `${granolaTransportPaths.folders}/${encodeURIComponent(id)}`;
}

export function granolaPluginPath(id: string): string {
  return `${granolaTransportPaths.plugins}/${encodeURIComponent(id)}`;
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

export function granolaExportTargetsPath(): string {
  return granolaTransportPaths.exportTargets;
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

export function granolaAutomationHarnessExplainPath(meetingId: string): string {
  return appendSearchParams(granolaTransportPaths.automationHarnessExplain, {
    meetingId,
  });
}

export function granolaAutomationArtefactsPath(
  options: {
    kind?: GranolaAutomationArtefactKind;
    limit?: number;
    meetingId?: string;
    status?: GranolaAutomationArtefactStatus;
  } = {},
): string {
  return appendSearchParams(granolaTransportPaths.automationArtefacts, {
    kind: options.kind,
    limit: options.limit,
    meetingId: options.meetingId,
    status: options.status,
  });
}

export function granolaAutomationRunDecisionPath(
  id: string,
  decision: "approve" | "reject",
): string {
  return `${granolaTransportPaths.automationRuns}/${encodeURIComponent(id)}/${decision}`;
}

export function granolaAutomationArtefactRerunPath(id: string): string {
  return `${granolaTransportPaths.automationArtefacts}/${encodeURIComponent(id)}/rerun`;
}

export function granolaAutomationArtefactPath(id: string): string {
  return `${granolaTransportPaths.automationArtefacts}/${encodeURIComponent(id)}`;
}

export function granolaAutomationArtefactDecisionPath(
  id: string,
  decision: "approve" | "reject",
): string {
  return `${granolaAutomationArtefactPath(id)}/${decision}`;
}

export function granolaAutomationArtefactPublishPreviewPath(
  id: string,
  options: { targetId?: string } = {},
): string {
  return appendSearchParams(`${granolaAutomationArtefactPath(id)}/publish-preview`, {
    targetId: options.targetId,
  });
}

export function granolaAutomationArtefactUpdatePath(id: string): string {
  return `${granolaAutomationArtefactPath(id)}/update`;
}

export function granolaProcessingIssuesPath(
  options: {
    limit?: number;
    meetingId?: string;
    severity?: GranolaProcessingIssueSeverity;
  } = {},
): string {
  return appendSearchParams(granolaTransportPaths.processingIssues, {
    limit: options.limit,
    meetingId: options.meetingId,
    severity: options.severity,
  });
}

export function granolaProcessingIssueRecoverPath(id: string): string {
  return `${granolaTransportPaths.processingIssues}/${encodeURIComponent(id)}/recover`;
}

export function granolaExportJobRerunPath(id: string): string {
  return `${granolaTransportPaths.exportJobs}/${encodeURIComponent(id)}/rerun`;
}
