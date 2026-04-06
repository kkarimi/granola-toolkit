import { existsSync } from "node:fs";

import { buildFolderSummary } from "../folders.ts";
import {
  buildMeetingRecord,
  listMeetings,
  resolveMeeting,
  resolveMeetingQuery,
} from "../meetings.ts";
import type { GranolaApiClient } from "../client/granola.ts";
import type { CacheData, GranolaDocument, GranolaFolder, TranscriptSegment } from "../types.ts";
import { granolaCacheCandidates } from "../utils.ts";

import type { FolderSummaryRecord, MeetingSummaryRecord } from "./models.ts";
import type {
  GranolaAppAuthMode,
  GranolaAppAuthState,
  GranolaAppCacheState,
  GranolaAppDocumentsState,
  GranolaAppFoldersState,
  GranolaMeetingBundle,
} from "./types.ts";
import type { AppConfig } from "../types.ts";

export type GranolaCatalogClient = Pick<GranolaApiClient, "listDocuments"> &
  Partial<Pick<GranolaApiClient, "getDocumentTranscript" | "listFolders">>;

export interface GranolaCatalogDependencies {
  cacheLoader: (cacheFile?: string) => Promise<CacheData | undefined>;
  createGranolaClient?: (mode?: GranolaAppAuthMode) => Promise<{
    auth: GranolaAppAuthState;
    client: GranolaCatalogClient;
  }>;
  getAuthMode: () => GranolaAppAuthMode;
  granolaClient?: GranolaCatalogClient;
  nowIso: () => string;
  onAuthState: (auth: GranolaAppAuthState) => void;
  onCacheState: (state: GranolaAppCacheState) => void;
  onDocumentsState: (state: GranolaAppDocumentsState) => void;
  onFoldersState: (state: GranolaAppFoldersState) => void;
}

export interface GranolaCatalogLiveSnapshot {
  cacheData?: CacheData;
  documents: GranolaDocument[];
  folders?: GranolaFolder[];
  meetings: MeetingSummaryRecord[];
}

function cloneFolderSummary(folder: FolderSummaryRecord): FolderSummaryRecord {
  return { ...folder };
}

function cloneGranolaFolder(folder: GranolaFolder): GranolaFolder {
  return {
    ...folder,
    documentIds: [...folder.documentIds],
  };
}

function cloneTranscriptSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

export class GranolaCatalogService {
  #cacheData?: CacheData;
  #cacheResolved = false;
  #documents?: GranolaDocument[];
  #folders?: GranolaFolder[];
  #granolaClient?: GranolaCatalogClient;
  #hydratedTranscriptSegments = new Map<string, TranscriptSegment[]>();

  constructor(
    private readonly config: AppConfig,
    private readonly deps: GranolaCatalogDependencies,
  ) {}

  resetRemoteState(): void {
    this.#granolaClient = undefined;
    this.#folders = undefined;
    this.#documents = undefined;
    this.resetDocumentsState();
    this.resetFoldersState();
  }

  resetDocumentsState(): void {
    this.#documents = undefined;
    this.#hydratedTranscriptSegments.clear();
    this.deps.onDocumentsState({
      count: 0,
      loaded: false,
    });
  }

  resetFoldersState(): void {
    this.#folders = undefined;
    this.deps.onFoldersState({
      count: 0,
      loaded: false,
    });
  }

  resetCacheState(): void {
    this.#cacheData = undefined;
    this.#cacheResolved = false;
    this.deps.onCacheState({
      configured: Boolean(this.config.transcripts.cacheFile),
      documentCount: 0,
      filePath: this.config.transcripts.cacheFile || undefined,
      loaded: false,
      transcriptCount: 0,
    });
  }

  async listDocuments(options: { forceRefresh?: boolean } = {}): Promise<GranolaDocument[]> {
    if (options.forceRefresh) {
      this.resetDocumentsState();
    }

    if (this.#documents) {
      return this.#documents;
    }

    const documents = await (
      await this.getGranolaClient()
    ).listDocuments({
      timeoutMs: this.config.notes.timeoutMs,
    });

    this.#documents = documents;
    this.deps.onDocumentsState({
      count: documents.length,
      loaded: true,
      loadedAt: this.deps.nowIso(),
    });
    return documents;
  }

  async loadCache(
    options: { forceRefresh?: boolean; required?: boolean } = {},
  ): Promise<CacheData | undefined> {
    if (options.forceRefresh) {
      this.resetCacheState();
    }

    if (this.#cacheResolved) {
      if (options.required && !this.#cacheData) {
        throw this.missingCacheError();
      }
      return this.#cacheData;
    }

    const cacheFile = this.config.transcripts.cacheFile || undefined;
    if (!cacheFile) {
      this.#cacheResolved = true;
      if (options.required) {
        throw this.missingCacheError();
      }
      return undefined;
    }

    if (!existsSync(cacheFile)) {
      throw new Error(`Granola cache file not found: ${cacheFile}`);
    }

    const cacheData = await this.deps.cacheLoader(cacheFile);
    this.#cacheResolved = true;
    this.#cacheData = cacheData;
    this.deps.onCacheState({
      configured: true,
      documentCount: cacheData ? Object.keys(cacheData.documents).length : 0,
      filePath: cacheFile,
      loaded: Boolean(cacheData),
      loadedAt: cacheData ? this.deps.nowIso() : undefined,
      transcriptCount: cacheData ? transcriptCount(cacheData) : 0,
    });

    if (options.required && !cacheData) {
      throw this.missingCacheError();
    }

    return cacheData;
  }

  async loadFolders(
    options: {
      forceRefresh?: boolean;
      required?: boolean;
    } = {},
  ): Promise<GranolaFolder[] | undefined> {
    if (options.forceRefresh) {
      this.resetFoldersState();
    }

    if (this.#folders) {
      return this.#folders.map(cloneGranolaFolder);
    }

    const client = await this.getGranolaClient();
    if (!client.listFolders) {
      const documents = await this.listDocuments({
        forceRefresh: options.forceRefresh,
      });
      const folders = this.deriveFoldersFromDocuments(documents);
      if (folders) {
        this.#folders = folders.map(cloneGranolaFolder);
        this.deps.onFoldersState({
          count: folders.length,
          loaded: true,
          loadedAt: this.deps.nowIso(),
        });
        return this.#folders.map(cloneGranolaFolder);
      }

      if (options.required) {
        throw new Error("Granola folder API is not configured");
      }
      return undefined;
    }

    try {
      const folders = await client.listFolders({
        timeoutMs: this.config.notes.timeoutMs,
      });
      this.#folders = folders.map(cloneGranolaFolder);
      this.deps.onFoldersState({
        count: this.#folders.length,
        loaded: true,
        loadedAt: this.deps.nowIso(),
      });
      return this.#folders.map(cloneGranolaFolder);
    } catch (error) {
      if (options.required) {
        throw error;
      }
      return undefined;
    }
  }

  buildFoldersByDocumentId(
    folders: GranolaFolder[] | undefined,
  ): Map<string, FolderSummaryRecord[]> | undefined {
    if (!folders || folders.length === 0) {
      return undefined;
    }

    const byDocumentId = new Map<string, FolderSummaryRecord[]>();
    for (const folder of folders) {
      const summary = buildFolderSummary(folder);
      for (const documentId of folder.documentIds) {
        const existing = byDocumentId.get(documentId) ?? [];
        existing.push(summary);
        byDocumentId.set(documentId, existing);
      }
    }

    for (const [documentId, summaries] of byDocumentId.entries()) {
      byDocumentId.set(
        documentId,
        summaries
          .slice()
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((folder) => cloneFolderSummary(folder)),
      );
    }

    return byDocumentId;
  }

  async liveMeetingSnapshot(
    options: { forceRefresh?: boolean } = {},
  ): Promise<GranolaCatalogLiveSnapshot> {
    const cacheData = await this.loadCache({
      forceRefresh: options.forceRefresh,
    });
    const documents = await this.listDocuments({
      forceRefresh: options.forceRefresh,
    });
    const folders = await this.loadFolders({
      forceRefresh: options.forceRefresh,
    });
    const meetings = listMeetings(documents, {
      cacheData,
      foldersByDocumentId: this.buildFoldersByDocumentId(folders),
      limit: Math.max(documents.length, 1),
      sort: "updated-desc",
    });

    return {
      cacheData,
      documents,
      folders,
      meetings,
    };
  }

  async readMeetingBundleById(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    const documents = await this.listDocuments();
    const cacheData = await this.loadCache({ required: options.requireCache });
    const folders = await this.loadFolders();
    const document = await this.hydrateMeetingTranscript(resolveMeeting(documents, id), cacheData);
    const meeting = buildMeetingRecord(
      document,
      cacheData,
      this.buildFoldersByDocumentId(folders)?.get(document.id),
    );

    return {
      cacheData,
      document,
      meeting,
    };
  }

  async readMeetingBundleByQuery(
    query: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle> {
    const documents = await this.listDocuments();
    const cacheData = await this.loadCache({ required: options.requireCache });
    const folders = await this.loadFolders();
    const document = await this.hydrateMeetingTranscript(
      resolveMeetingQuery(documents, query),
      cacheData,
    );
    const meeting = buildMeetingRecord(
      document,
      cacheData,
      this.buildFoldersByDocumentId(folders)?.get(document.id),
    );

    return {
      cacheData,
      document,
      meeting,
    };
  }

  async maybeReadMeetingBundleById(
    id: string,
    options: { requireCache?: boolean } = {},
  ): Promise<GranolaMeetingBundle | undefined> {
    try {
      return await this.readMeetingBundleById(id, options);
    } catch {
      return undefined;
    }
  }

  private async getGranolaClient(): Promise<GranolaCatalogClient> {
    if (this.#granolaClient) {
      return this.#granolaClient;
    }

    if (this.deps.granolaClient) {
      this.#granolaClient = this.deps.granolaClient;
      return this.#granolaClient;
    }

    if (!this.deps.createGranolaClient) {
      throw new Error("Granola API client is not configured");
    }

    const runtime = await this.deps.createGranolaClient(this.deps.getAuthMode());
    this.#granolaClient = runtime.client;
    this.deps.onAuthState(runtime.auth);
    return this.#granolaClient;
  }

  private deriveFoldersFromDocuments(documents: GranolaDocument[]): GranolaFolder[] | undefined {
    const byFolderId = new Map<string, GranolaFolder>();

    for (const document of documents) {
      for (const membership of document.folderMemberships ?? []) {
        const existing = byFolderId.get(membership.id);
        if (existing) {
          existing.documentIds = [...new Set([...existing.documentIds, document.id])];
          existing.updatedAt =
            existing.updatedAt.localeCompare(document.updatedAt) >= 0
              ? existing.updatedAt
              : document.updatedAt;
          if (!existing.createdAt || existing.createdAt.localeCompare(document.createdAt) > 0) {
            existing.createdAt = document.createdAt;
          }
          continue;
        }

        byFolderId.set(membership.id, {
          createdAt: document.createdAt,
          documentIds: [document.id],
          id: membership.id,
          isFavourite: false,
          name: membership.name,
          updatedAt: document.updatedAt,
        });
      }
    }

    if (byFolderId.size === 0) {
      return undefined;
    }

    return [...byFolderId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  private missingCacheError(): Error {
    return new Error(
      `Granola cache file not found. Pass --cache or create .granola.toml. Expected locations include: ${granolaCacheCandidates().join(", ")}`,
    );
  }

  private attachMeetingTranscriptSegments(
    document: GranolaDocument,
    segments: TranscriptSegment[],
    cacheData?: CacheData,
  ): GranolaDocument {
    const nextSegments = cloneTranscriptSegments(segments);

    if (cacheData) {
      cacheData.transcripts[document.id] = cloneTranscriptSegments(nextSegments);
      cacheData.documents[document.id] ??= {
        createdAt: document.createdAt,
        id: document.id,
        title: document.title,
        updatedAt: document.updatedAt,
      };
    }

    const nextDocument = {
      ...document,
      transcriptSegments: nextSegments,
    };

    if (this.#documents) {
      const index = this.#documents.findIndex((candidate) => candidate.id === document.id);
      if (index >= 0) {
        this.#documents[index] = nextDocument;
      }
    }

    return nextDocument;
  }

  private async hydrateMeetingTranscript(
    document: GranolaDocument,
    cacheData?: CacheData,
  ): Promise<GranolaDocument> {
    const inlineSegments = document.transcriptSegments;
    if (Array.isArray(inlineSegments) && inlineSegments.length > 0) {
      return document;
    }

    const cachedSegments = cacheData?.transcripts[document.id];
    if (Array.isArray(cachedSegments) && cachedSegments.length > 0) {
      return document;
    }

    if (this.#hydratedTranscriptSegments.has(document.id)) {
      return this.attachMeetingTranscriptSegments(
        document,
        this.#hydratedTranscriptSegments.get(document.id) ?? [],
        cacheData,
      );
    }

    const client = await this.getGranolaClient();
    if (typeof client.getDocumentTranscript !== "function") {
      return document;
    }

    try {
      const transcriptSegments = await client.getDocumentTranscript(document.id, {
        timeoutMs: this.config.notes.timeoutMs,
      });
      this.#hydratedTranscriptSegments.set(
        document.id,
        cloneTranscriptSegments(transcriptSegments),
      );
      return this.attachMeetingTranscriptSegments(document, transcriptSegments, cacheData);
    } catch {
      return document;
    }
  }
}

function transcriptCount(cacheData: CacheData): number {
  return Object.values(cacheData.transcripts).filter((segments) => segments.length > 0).length;
}
