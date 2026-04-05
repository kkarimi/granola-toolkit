import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { GranolaAutomationArtefact } from "./app/types.ts";
import type { FolderSummaryRecord, MeetingSummaryRecord } from "./app/models.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import type { CacheData, GranolaDocument } from "./types.ts";
import { parseJsonString } from "./utils.ts";

const SEARCH_INDEX_VERSION = 2;

export interface GranolaSearchIndexEntry {
  artefactActionNames: string[];
  artefactCount: number;
  artefactKinds: string[];
  artefactRuleNames: string[];
  artefactText: string;
  artefactTitles: string[];
  createdAt: string;
  folderIds: string[];
  folderNames: string[];
  id: string;
  noteText: string;
  tags: string[];
  title: string;
  transcriptLoaded: boolean;
  transcriptText: string;
  updatedAt: string;
}

interface SearchIndexFile {
  entries: GranolaSearchIndexEntry[];
  updatedAt: string;
  version: number;
}

export interface SearchIndexStore {
  readIndex(): Promise<GranolaSearchIndexEntry[]>;
  writeIndex(entries: GranolaSearchIndexEntry[]): Promise<void>;
}

function cloneEntry(entry: GranolaSearchIndexEntry): GranolaSearchIndexEntry {
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

function noteText(document: GranolaDocument): string {
  const notes = document.notesPlain.trim();
  if (notes) {
    return notes;
  }

  const panel = document.lastViewedPanel?.originalContent?.trim();
  if (panel) {
    return panel;
  }

  return document.content.trim();
}

function transcriptText(documentId: string, cacheData?: CacheData): string {
  const segments = cacheData?.transcripts[documentId] ?? [];
  return segments
    .filter((segment) => segment.isFinal)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");
}

interface SearchArtefactRecord {
  actionNames: string[];
  count: number;
  kinds: string[];
  ruleNames: string[];
  text: string;
  titles: string[];
}

function artefactSearchText(artefact: GranolaAutomationArtefact): string {
  return [
    artefact.kind,
    artefact.ruleName,
    artefact.actionName,
    artefact.structured.title,
    artefact.structured.summary,
    artefact.structured.markdown,
    ...artefact.structured.highlights,
    ...artefact.structured.decisions,
    ...artefact.structured.followUps,
    ...artefact.structured.actionItems.flatMap((item) => [item.title, item.owner, item.dueDate]),
    ...artefact.structured.sections.flatMap((section) => [section.title, section.body]),
    ...(artefact.structured.participantSummaries?.flatMap((summary) => [
      summary.speaker,
      summary.summary,
      ...summary.actionItems,
    ]) ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function searchableArtefacts(
  artefacts?: GranolaAutomationArtefact[],
): Map<string, SearchArtefactRecord> {
  const grouped = new Map<string, SearchArtefactRecord>();

  for (const artefact of artefacts ?? []) {
    if (artefact.status !== "approved" && artefact.status !== "generated") {
      continue;
    }

    const current = grouped.get(artefact.meetingId) ?? {
      actionNames: [],
      count: 0,
      kinds: [],
      ruleNames: [],
      text: "",
      titles: [],
    };
    const text = artefactSearchText(artefact);

    current.count += 1;
    if (!current.kinds.includes(artefact.kind)) {
      current.kinds.push(artefact.kind);
    }
    if (!current.ruleNames.includes(artefact.ruleName)) {
      current.ruleNames.push(artefact.ruleName);
    }
    if (!current.actionNames.includes(artefact.actionName)) {
      current.actionNames.push(artefact.actionName);
    }
    if (!current.titles.includes(artefact.structured.title)) {
      current.titles.push(artefact.structured.title);
    }
    current.text = [current.text, text].filter(Boolean).join("\n");

    grouped.set(artefact.meetingId, current);
  }

  return grouped;
}

function artefactRecord(
  documentId: string,
  artefactsByMeetingId: Map<string, SearchArtefactRecord>,
): SearchArtefactRecord {
  return (
    artefactsByMeetingId.get(documentId) ?? {
      actionNames: [],
      count: 0,
      kinds: [],
      ruleNames: [],
      text: "",
      titles: [],
    }
  );
}

export function buildSearchIndex(
  documents: GranolaDocument[],
  options: {
    artefacts?: GranolaAutomationArtefact[];
    cacheData?: CacheData;
    foldersByDocumentId?: Map<string, FolderSummaryRecord[]>;
  } = {},
): GranolaSearchIndexEntry[] {
  const artefactsByMeetingId = searchableArtefacts(options.artefacts);
  return documents
    .map((document) => {
      const folders = options.foldersByDocumentId?.get(document.id) ?? [];
      const transcript = transcriptText(document.id, options.cacheData);
      const artefacts = artefactRecord(document.id, artefactsByMeetingId);
      return {
        artefactActionNames: [...artefacts.actionNames],
        artefactCount: artefacts.count,
        artefactKinds: [...artefacts.kinds],
        artefactRuleNames: [...artefacts.ruleNames],
        artefactText: artefacts.text,
        artefactTitles: [...artefacts.titles],
        createdAt: document.createdAt,
        folderIds: folders.map((folder) => folder.id),
        folderNames: folders.map((folder) => folder.name || folder.id),
        id: document.id,
        noteText: noteText(document),
        tags: [...document.tags],
        title: document.title,
        transcriptLoaded: transcript.length > 0,
        transcriptText: transcript,
        updatedAt: document.updatedAt,
      } satisfies GranolaSearchIndexEntry;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function mergeSearchIndexArtefacts(
  entries: GranolaSearchIndexEntry[],
  artefacts?: GranolaAutomationArtefact[],
): GranolaSearchIndexEntry[] {
  const artefactsByMeetingId = searchableArtefacts(artefacts);

  return entries.map((entry) => {
    const artefact = artefactRecord(entry.id, artefactsByMeetingId);
    return {
      ...cloneEntry(entry),
      artefactActionNames: [...artefact.actionNames],
      artefactCount: artefact.count,
      artefactKinds: [...artefact.kinds],
      artefactRuleNames: [...artefact.ruleNames],
      artefactText: artefact.text,
      artefactTitles: [...artefact.titles],
    };
  });
}

function searchFieldScore(value: string, term: string): number {
  const lower = value.toLowerCase();
  if (!lower || !term) {
    return 0;
  }

  if (lower === term) {
    return 8;
  }

  if (lower.startsWith(term)) {
    return 5;
  }

  if (lower.includes(term)) {
    return 3;
  }

  return 0;
}

function combinedText(entry: GranolaSearchIndexEntry): string {
  return [
    entry.id,
    entry.title,
    ...entry.tags,
    ...entry.folderNames,
    ...entry.artefactKinds,
    ...entry.artefactRuleNames,
    ...entry.artefactActionNames,
    ...entry.artefactTitles,
    entry.noteText,
    entry.artefactText,
    entry.transcriptText,
  ]
    .join("\n")
    .toLowerCase();
}

function searchEntryScore(entry: GranolaSearchIndexEntry, term: string): number | undefined {
  const scoredFields = [
    searchFieldScore(entry.id, term) * 5,
    searchFieldScore(entry.title, term) * 8,
    ...entry.tags.map((tag) => searchFieldScore(tag, term) * 6),
    ...entry.folderNames.map((folderName) => searchFieldScore(folderName, term) * 4),
    ...entry.artefactTitles.map((title) => searchFieldScore(title, term) * 7),
    ...entry.artefactRuleNames.map((ruleName) => searchFieldScore(ruleName, term) * 5),
    ...entry.artefactActionNames.map((actionName) => searchFieldScore(actionName, term) * 4),
    ...entry.artefactKinds.map((kind) => searchFieldScore(kind, term) * 3),
  ].filter((score) => score > 0);

  if (scoredFields.length > 0) {
    return Math.max(...scoredFields);
  }

  if (combinedText(entry).includes(term)) {
    return 1;
  }

  return undefined;
}

export function searchSearchIndex(
  entries: GranolaSearchIndexEntry[],
  query: string,
): Array<{ id: string; score: number }> {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  return entries
    .map((entry) => {
      let score = 0;
      for (const term of terms) {
        const termScore = searchEntryScore(entry, term);
        if (termScore == null) {
          return undefined;
        }

        score += termScore;
      }

      return {
        id: entry.id,
        score,
        updatedAt: entry.updatedAt,
      };
    })
    .filter((entry): entry is { id: string; score: number; updatedAt: string } => Boolean(entry))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.id.localeCompare(right.id),
    )
    .map(({ id, score }) => ({ id, score }));
}

export class MemorySearchIndexStore implements SearchIndexStore {
  #entries: GranolaSearchIndexEntry[] = [];

  async readIndex(): Promise<GranolaSearchIndexEntry[]> {
    return this.#entries.map(cloneEntry);
  }

  async writeIndex(entries: GranolaSearchIndexEntry[]): Promise<void> {
    this.#entries = entries.map(cloneEntry);
  }
}

export class FileSearchIndexStore implements SearchIndexStore {
  constructor(private readonly filePath: string = defaultSearchIndexFilePath()) {}

  async readIndex(): Promise<GranolaSearchIndexEntry[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<SearchIndexFile>(contents);
      if (!parsed || parsed.version !== SEARCH_INDEX_VERSION || !Array.isArray(parsed.entries)) {
        return [];
      }

      return parsed.entries.map(cloneEntry);
    } catch {
      return [];
    }
  }

  async writeIndex(entries: GranolaSearchIndexEntry[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload: SearchIndexFile = {
      entries: entries.map(cloneEntry),
      updatedAt: new Date().toISOString(),
      version: SEARCH_INDEX_VERSION,
    };
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export function defaultSearchIndexFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().searchIndexFile;
}

export function createDefaultSearchIndexStore(): SearchIndexStore {
  return new FileSearchIndexStore();
}

export function meetingIdsFromSearchResults(
  results: Array<{ id: string; score: number }>,
): string[] {
  return results.map((result) => result.id);
}

export function filterSearchEntriesByMeetings(
  entries: GranolaSearchIndexEntry[],
  meetings: MeetingSummaryRecord[],
): GranolaSearchIndexEntry[] {
  const ids = new Set(meetings.map((meeting) => meeting.id));
  return entries.filter((entry) => ids.has(entry.id)).map(cloneEntry);
}
