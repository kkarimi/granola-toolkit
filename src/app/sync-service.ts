import { buildSearchIndex, type GranolaSearchIndexEntry } from "../search-index.ts";
import { buildSyncEvents, diffMeetingSummaries } from "../sync.ts";
import type { GranEventHookRunner } from "../event-hooks.ts";
import type { SyncStateStore } from "../sync-state.ts";
import type { SyncEventStore } from "../sync-events.ts";

import type { GranolaCatalogLiveSnapshot } from "./catalog.ts";
import type { FolderSummaryRecord, MeetingSummaryRecord } from "./models.ts";
import type {
  GranolaAppSyncChange,
  GranolaAppSyncEvent,
  GranolaAppSyncEventsResult,
  GranolaAppSyncResult,
  GranolaAppSyncRun,
  GranolaAppSyncState,
  GranolaAutomationArtefact,
} from "./types.ts";

export function cloneSyncChange(change: GranolaAppSyncChange): GranolaAppSyncChange {
  return { ...change };
}

export function cloneSyncRun(run: GranolaAppSyncRun): GranolaAppSyncRun {
  return {
    ...run,
    changes: run.changes.map(cloneSyncChange),
    summary: run.summary ? { ...run.summary } : undefined,
  };
}

export function cloneSyncState(state: GranolaAppSyncState): GranolaAppSyncState {
  return {
    ...state,
    lastChanges: state.lastChanges.map(cloneSyncChange),
    recentRuns: (state.recentRuns ?? []).map(cloneSyncRun),
    summary: state.summary ? { ...state.summary } : undefined,
  };
}

export function cloneSyncEvent(event: GranolaAppSyncEvent): GranolaAppSyncEvent {
  return { ...event };
}

interface GranolaSyncServiceDependencies {
  automationPluginEnabled: () => boolean;
  buildFoldersByDocumentId: (
    folders: GranolaCatalogLiveSnapshot["folders"],
  ) => Map<string, FolderSummaryRecord[]> | undefined;
  emitStateUpdate: () => void;
  eventHookRunner?: GranEventHookRunner;
  getAutomationArtefacts: () => GranolaAutomationArtefact[];
  indexMeetings: () => MeetingSummaryRecord[];
  liveMeetingSnapshot: (options?: {
    forceRefresh?: boolean;
  }) => Promise<GranolaCatalogLiveSnapshot>;
  logger?: Pick<Console, "warn">;
  nowIso: () => string;
  persistMeetingIndex: (meetings: MeetingSummaryRecord[]) => Promise<void>;
  persistSearchIndex: (entries: GranolaSearchIndexEntry[]) => Promise<void>;
  processSyncEvents: (events: GranolaAppSyncEvent[], matchedAt: string) => Promise<unknown>;
  state: GranolaAppSyncState;
  syncEventStore?: SyncEventStore;
  syncStateStore?: SyncStateStore;
}

export class GranolaSyncService {
  constructor(private readonly deps: GranolaSyncServiceDependencies) {}

  async inspectSync(): Promise<GranolaAppSyncState> {
    return cloneSyncState(this.deps.state);
  }

  async listSyncEvents(options: { limit?: number } = {}): Promise<GranolaAppSyncEventsResult> {
    if (!this.deps.syncEventStore) {
      return {
        events: [],
      };
    }

    return {
      events: (await this.deps.syncEventStore.readEvents(options.limit)).map(cloneSyncEvent),
    };
  }

  async sync(
    options: { forceRefresh?: boolean; foreground?: boolean } = {},
  ): Promise<GranolaAppSyncResult> {
    return await this.runSync({
      forceRefresh: options.forceRefresh,
      foreground: options.foreground ?? true,
    });
  }

  private async persistSyncState(): Promise<void> {
    if (!this.deps.syncStateStore) {
      return;
    }

    await this.deps.syncStateStore.writeState(this.deps.state);
  }

  private createSyncRunId(timestamp = this.deps.nowIso()): string {
    return `sync-${timestamp.replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "")}`;
  }

  private recordSyncRun(run: GranolaAppSyncRun): GranolaAppSyncRun[] {
    return [
      cloneSyncRun(run),
      ...(this.deps.state.recentRuns ?? []).filter((entry) => entry.id !== run.id),
    ]
      .slice(0, 25)
      .map(cloneSyncRun);
  }

  private async runSync(options: {
    forceRefresh?: boolean;
    foreground: boolean;
  }): Promise<GranolaAppSyncResult> {
    const previousMeetings = this.deps.indexMeetings();
    const startedAt = this.deps.nowIso();
    const runId = this.createSyncRunId(startedAt);
    this.deps.state.lastError = undefined;
    this.deps.state.lastRunId = runId;
    this.deps.state.lastStartedAt = startedAt;
    this.deps.state.running = true;
    this.deps.emitStateUpdate();

    try {
      const snapshot = await this.deps.liveMeetingSnapshot({
        forceRefresh: options.forceRefresh ?? true,
      });
      await this.deps.persistMeetingIndex(snapshot.meetings);
      await this.deps.persistSearchIndex(
        buildSearchIndex(snapshot.documents, {
          artefacts: this.deps.automationPluginEnabled() ? this.deps.getAutomationArtefacts() : [],
          cacheData: snapshot.cacheData,
          foldersByDocumentId: this.deps.buildFoldersByDocumentId(snapshot.folders),
        }),
      );
      const { changes, summary } = diffMeetingSummaries(
        previousMeetings,
        snapshot.meetings,
        snapshot.folders?.length ?? 0,
      );
      const completedAt = this.deps.nowIso();
      const events = buildSyncEvents(
        runId,
        completedAt,
        changes,
        previousMeetings,
        snapshot.meetings,
      );
      if (events.length > 0 && this.deps.syncEventStore) {
        await this.deps.syncEventStore.appendEvents(events);
      }
      if (events.length > 0 && this.deps.eventHookRunner) {
        try {
          await this.deps.eventHookRunner.runEvents(events);
        } catch (error) {
          this.deps.logger?.warn?.(
            `event hook runner failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (this.deps.automationPluginEnabled()) {
        await this.deps.processSyncEvents(events, completedAt);
      }
      this.deps.state.eventCount += events.length;
      this.deps.state.lastChanges = changes.slice(0, 50).map(cloneSyncChange);
      this.deps.state.lastCompletedAt = completedAt;
      this.deps.state.lastError = undefined;
      this.deps.state.lastRunId = runId;
      this.deps.state.recentRuns = this.recordSyncRun({
        changeCount: changes.length,
        changes: changes.slice(0, 20).map(cloneSyncChange),
        completedAt,
        id: runId,
        startedAt,
        status: "succeeded",
        summary: { ...summary },
      });
      this.deps.state.running = false;
      this.deps.state.summary = { ...summary };
      await this.persistSyncState();
      this.deps.emitStateUpdate();

      return {
        changes: changes.map(cloneSyncChange),
        state: cloneSyncState(this.deps.state),
        summary: { ...summary },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = this.deps.nowIso();
      this.deps.state.lastError = message;
      this.deps.state.lastFailedAt = failedAt;
      this.deps.state.lastRunId = runId;
      this.deps.state.recentRuns = this.recordSyncRun({
        changeCount: 0,
        changes: [],
        error: message,
        failedAt,
        id: runId,
        startedAt,
        status: "failed",
      });
      this.deps.state.running = false;
      await this.persistSyncState();
      this.deps.emitStateUpdate();
      throw error;
    }
  }
}
