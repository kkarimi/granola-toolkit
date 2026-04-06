import {
  meetingIdsFromSearchResults,
  mergeSearchIndexArtefacts,
  searchSearchIndex,
  type GranolaSearchIndexEntry,
  type SearchIndexStore,
} from "../search-index.ts";
import type { MeetingIndexStore } from "../meeting-index.ts";
import type { GranolaAutomationArtefact } from "./types.ts";
import type { MeetingSummaryRecord } from "./models.ts";
import type { GranolaMeetingSort, GranolaAppIndexState } from "./types.ts";
import { cloneMeetingSummaryRecord } from "./meeting-read-model.ts";
import { filterMeetingSummaries } from "../meetings.ts";

function cloneSearchIndexEntry(entry: GranolaSearchIndexEntry): GranolaSearchIndexEntry {
  return {
    ...entry,
    artefactActionNames: [...entry.artefactActionNames],
    artefactKinds: [...entry.artefactKinds],
    artefactRuleNames: [...entry.artefactRuleNames],
    artefactTitles: [...entry.artefactTitles],
    folderIds: [...entry.folderIds],
    folderNames: [...entry.folderNames],
    tags: [...entry.tags],
  };
}

interface GranolaIndexServiceDependencies {
  emitStateUpdate: () => void;
  meetingIndex?: MeetingSummaryRecord[];
  meetingIndexStore?: MeetingIndexStore;
  nowIso: () => string;
  searchIndex?: GranolaSearchIndexEntry[];
  searchIndexStore?: SearchIndexStore;
  state: GranolaAppIndexState;
}

export class GranolaIndexService {
  #meetingIndex: MeetingSummaryRecord[];
  #refreshing?: Promise<void>;
  #searchIndex: GranolaSearchIndexEntry[];

  constructor(private readonly deps: GranolaIndexServiceDependencies) {
    this.#meetingIndex = (deps.meetingIndex ?? []).map((meeting) =>
      cloneMeetingSummaryRecord(meeting),
    );
    this.#searchIndex = (deps.searchIndex ?? []).map((entry) => cloneSearchIndexEntry(entry));
    this.deps.state.available = this.#meetingIndex.length > 0;
    this.deps.state.loaded = this.#meetingIndex.length > 0;
    this.deps.state.loadedAt = this.#meetingIndex.length > 0 ? this.deps.nowIso() : undefined;
    this.deps.state.meetingCount = this.#meetingIndex.length;
  }

  hasMeetings(): boolean {
    return this.#meetingIndex.length > 0;
  }

  hasSearchIndex(): boolean {
    return this.#searchIndex.length > 0;
  }

  meetings(): MeetingSummaryRecord[] {
    return this.#meetingIndex.map((meeting) => cloneMeetingSummaryRecord(meeting));
  }

  searchFallbackMeetingId(query: string): string | undefined {
    return meetingIdsFromSearchResults(searchSearchIndex(this.#searchIndex, query))[0];
  }

  indexedMeetingsForSearch(options: {
    folderId?: string;
    limit?: number;
    search: string;
    sort?: GranolaMeetingSort;
    updatedFrom?: string;
    updatedTo?: string;
  }): MeetingSummaryRecord[] {
    const rankedIds = meetingIdsFromSearchResults(
      searchSearchIndex(this.#searchIndex, options.search),
    );
    const rankById = new Map(rankedIds.map((id, index) => [id, index] as const));
    const baseMeetings = this.#meetingIndex.filter((meeting) => rankById.has(meeting.id));
    const rankedMeetings = [...baseMeetings].sort((left, right) => {
      const leftRank = rankById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rankById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });

    return filterMeetingSummaries(rankedMeetings, {
      folderId: options.folderId,
      limit: options.limit,
      sort: options.sort,
      updatedFrom: options.updatedFrom,
      updatedTo: options.updatedTo,
    });
  }

  async persistMeetingIndex(meetings: MeetingSummaryRecord[]): Promise<void> {
    this.#meetingIndex = meetings.map((meeting) => cloneMeetingSummaryRecord(meeting));
    this.deps.state.available = this.#meetingIndex.length > 0;
    this.deps.state.loaded = this.#meetingIndex.length > 0;
    this.deps.state.loadedAt = this.#meetingIndex.length > 0 ? this.deps.nowIso() : undefined;
    this.deps.state.meetingCount = this.#meetingIndex.length;

    if (this.deps.meetingIndexStore) {
      await this.deps.meetingIndexStore.writeIndex(this.#meetingIndex);
    }

    this.deps.emitStateUpdate();
  }

  async persistSearchIndex(entries: GranolaSearchIndexEntry[]): Promise<void> {
    this.#searchIndex = entries.map((entry) => cloneSearchIndexEntry(entry));

    if (this.deps.searchIndexStore) {
      await this.deps.searchIndexStore.writeIndex(this.#searchIndex);
    }
  }

  async mergeArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void> {
    if (this.#searchIndex.length === 0) {
      return;
    }

    await this.persistSearchIndex(mergeSearchIndexArtefacts(this.#searchIndex, artefacts));
  }

  triggerBackgroundRefresh(refresh: () => Promise<void>): void {
    if (this.#refreshing) {
      return;
    }

    this.#refreshing = (async () => {
      try {
        await refresh();
      } finally {
        this.#refreshing = undefined;
      }
    })();
  }
}
