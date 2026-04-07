import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  GranolaAppSyncChange,
  GranolaAppSyncRun,
  GranolaAppSyncState,
  GranolaAppSyncSummary,
} from "./app/types.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { parseJsonString } from "./utils.ts";

const SYNC_STATE_VERSION = 1;
const MAX_STORED_CHANGES = 50;
const MAX_STORED_RUNS = 25;

interface SyncStateFile {
  eventCount?: number;
  eventsFile?: string;
  lastChanges?: GranolaAppSyncChange[];
  lastCompletedAt?: string;
  lastError?: string;
  lastFailedAt?: string;
  lastRunId?: string;
  lastStartedAt?: string;
  recentRuns?: GranolaAppSyncRun[];
  summary?: GranolaAppSyncSummary;
  version: number;
}

function cloneSyncChange(change: GranolaAppSyncChange): GranolaAppSyncChange {
  return { ...change };
}

function cloneSyncSummary(summary?: GranolaAppSyncSummary): GranolaAppSyncSummary | undefined {
  return summary ? { ...summary } : undefined;
}

function cloneSyncRun(run: GranolaAppSyncRun): GranolaAppSyncRun {
  return {
    ...run,
    changes: run.changes.map(cloneSyncChange),
    summary: cloneSyncSummary(run.summary),
  };
}

function cloneSyncState(state: GranolaAppSyncState): GranolaAppSyncState {
  return {
    ...state,
    lastChanges: state.lastChanges.map(cloneSyncChange),
    recentRuns: (state.recentRuns ?? []).slice(0, MAX_STORED_RUNS).map(cloneSyncRun),
    running: false,
    summary: cloneSyncSummary(state.summary),
  };
}

function normaliseSyncState(filePath: string, file?: SyncStateFile): GranolaAppSyncState {
  return {
    eventCount: file?.eventCount ?? 0,
    eventsFile: file?.eventsFile ?? defaultSyncEventsFilePath(),
    filePath,
    lastChanges: (file?.lastChanges ?? []).slice(0, MAX_STORED_CHANGES).map(cloneSyncChange),
    recentRuns: (file?.recentRuns ?? []).slice(0, MAX_STORED_RUNS).map(cloneSyncRun),
    running: false,
    ...(file?.lastCompletedAt ? { lastCompletedAt: file.lastCompletedAt } : {}),
    ...(file?.lastError ? { lastError: file.lastError } : {}),
    ...(file?.lastFailedAt ? { lastFailedAt: file.lastFailedAt } : {}),
    ...(file?.lastRunId ? { lastRunId: file.lastRunId } : {}),
    ...(file?.lastStartedAt ? { lastStartedAt: file.lastStartedAt } : {}),
    ...(file?.summary ? { summary: cloneSyncSummary(file.summary) } : {}),
  };
}

export interface SyncStateStore {
  readState(): Promise<GranolaAppSyncState>;
  writeState(state: GranolaAppSyncState): Promise<void>;
}

export class MemorySyncStateStore implements SyncStateStore {
  #state: GranolaAppSyncState;

  constructor(initialState: Partial<GranolaAppSyncState> = {}) {
    this.#state = {
      filePath: initialState.filePath ?? defaultSyncStateFilePath(),
      eventCount: initialState.eventCount ?? 0,
      eventsFile: initialState.eventsFile ?? defaultSyncEventsFilePath(),
      lastChanges: (initialState.lastChanges ?? []).map(cloneSyncChange),
      recentRuns: (initialState.recentRuns ?? []).map(cloneSyncRun),
      lastCompletedAt: initialState.lastCompletedAt,
      lastError: initialState.lastError,
      lastFailedAt: initialState.lastFailedAt,
      lastRunId: initialState.lastRunId,
      lastStartedAt: initialState.lastStartedAt,
      running: false,
      summary: cloneSyncSummary(initialState.summary),
    };
  }

  async readState(): Promise<GranolaAppSyncState> {
    return cloneSyncState(this.#state);
  }

  async writeState(state: GranolaAppSyncState): Promise<void> {
    this.#state = cloneSyncState(state);
  }
}

export class FileSyncStateStore implements SyncStateStore {
  constructor(private readonly filePath: string = defaultSyncStateFilePath()) {}

  async readState(): Promise<GranolaAppSyncState> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<SyncStateFile>(contents);
      if (!parsed || parsed.version !== SYNC_STATE_VERSION) {
        return normaliseSyncState(this.filePath);
      }

      return normaliseSyncState(this.filePath, parsed);
    } catch {
      return normaliseSyncState(this.filePath);
    }
  }

  async writeState(state: GranolaAppSyncState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload: SyncStateFile = {
      eventCount: state.eventCount,
      eventsFile: state.eventsFile,
      lastChanges: state.lastChanges.slice(0, MAX_STORED_CHANGES).map(cloneSyncChange),
      recentRuns: (state.recentRuns ?? []).slice(0, MAX_STORED_RUNS).map(cloneSyncRun),
      lastCompletedAt: state.lastCompletedAt,
      lastError: state.lastError,
      lastFailedAt: state.lastFailedAt,
      lastRunId: state.lastRunId,
      lastStartedAt: state.lastStartedAt,
      summary: cloneSyncSummary(state.summary),
      version: SYNC_STATE_VERSION,
    };
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export function defaultSyncStateFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().syncStateFile;
}

export function defaultSyncEventsFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().syncEventsFile;
}

export function createDefaultSyncStateStore(): SyncStateStore {
  return new FileSyncStateStore();
}
