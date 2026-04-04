import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  GranolaAppSyncChange,
  GranolaAppSyncState,
  GranolaAppSyncSummary,
} from "./app/types.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { parseJsonString } from "./utils.ts";

const SYNC_STATE_VERSION = 1;
const MAX_STORED_CHANGES = 50;

interface SyncStateFile {
  lastChanges?: GranolaAppSyncChange[];
  lastCompletedAt?: string;
  lastError?: string;
  lastFailedAt?: string;
  lastStartedAt?: string;
  summary?: GranolaAppSyncSummary;
  version: number;
}

function cloneSyncChange(change: GranolaAppSyncChange): GranolaAppSyncChange {
  return { ...change };
}

function cloneSyncSummary(summary?: GranolaAppSyncSummary): GranolaAppSyncSummary | undefined {
  return summary ? { ...summary } : undefined;
}

function cloneSyncState(state: GranolaAppSyncState): GranolaAppSyncState {
  return {
    ...state,
    lastChanges: state.lastChanges.map(cloneSyncChange),
    running: false,
    summary: cloneSyncSummary(state.summary),
  };
}

function normaliseSyncState(filePath: string, file?: SyncStateFile): GranolaAppSyncState {
  return {
    filePath,
    lastChanges: (file?.lastChanges ?? []).slice(0, MAX_STORED_CHANGES).map(cloneSyncChange),
    lastCompletedAt: file?.lastCompletedAt,
    lastError: file?.lastError,
    lastFailedAt: file?.lastFailedAt,
    lastStartedAt: file?.lastStartedAt,
    running: false,
    summary: cloneSyncSummary(file?.summary),
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
      lastChanges: (initialState.lastChanges ?? []).map(cloneSyncChange),
      lastCompletedAt: initialState.lastCompletedAt,
      lastError: initialState.lastError,
      lastFailedAt: initialState.lastFailedAt,
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
      lastChanges: state.lastChanges.slice(0, MAX_STORED_CHANGES).map(cloneSyncChange),
      lastCompletedAt: state.lastCompletedAt,
      lastError: state.lastError,
      lastFailedAt: state.lastFailedAt,
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

export function createDefaultSyncStateStore(): SyncStateStore {
  return new FileSyncStateStore();
}
