import { cloneGranolaExportJobState, cloneGranolaExportRunState } from "./export-service.ts";
import type { GranolaAppState } from "./types.ts";
import type { FolderSummaryRecord, MeetingSummaryRecord } from "./models.ts";
import { clonePluginsState } from "./plugin-state.ts";
import { cloneSyncState } from "./sync-service.ts";

export function cloneFolderSummary(folder: FolderSummaryRecord): FolderSummaryRecord {
  return { ...folder };
}

export function cloneMeetingSummary(meeting: MeetingSummaryRecord): MeetingSummaryRecord {
  return {
    ...meeting,
    folders: Array.isArray(meeting.folders)
      ? meeting.folders.map((folder) => cloneFolderSummary(folder))
      : [],
    tags: [...meeting.tags],
  };
}

export function cloneState(state: GranolaAppState): GranolaAppState {
  return {
    auth: { ...state.auth },
    automation: { ...state.automation },
    cache: { ...state.cache },
    config: {
      ...state.config,
      automation: state.config.automation ? { ...state.config.automation } : undefined,
      agents: state.config.agents ? { ...state.config.agents } : undefined,
      exports: state.config.exports ? { ...state.config.exports } : undefined,
      hooks: state.config.hooks
        ? {
            items: state.config.hooks.items.map((hook) => ({ ...hook })),
          }
        : undefined,
      notes: { ...state.config.notes },
      plugins: state.config.plugins ? { ...state.config.plugins } : undefined,
      transcripts: { ...state.config.transcripts },
    },
    documents: { ...state.documents },
    folders: { ...state.folders },
    exports: {
      jobs: state.exports.jobs.map((job) => cloneGranolaExportJobState(job)),
      notes: cloneGranolaExportRunState(state.exports.notes),
      transcripts: cloneGranolaExportRunState(state.exports.transcripts),
    },
    index: { ...state.index },
    plugins: clonePluginsState(state.plugins),
    sync: cloneSyncState(state.sync),
    ui: { ...state.ui },
  };
}
