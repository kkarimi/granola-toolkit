import type { GranolaDocument } from "../types.ts";

import { parsePublicNote, parsePublicNoteSummary, type PublicNoteSummary } from "./parsers.ts";
import { granolaClientHttpError } from "./errors.ts";
import type { AuthenticatedHttpClient } from "./http.ts";

const PUBLIC_NOTES_URL = "https://public-api.granola.ai/v1/notes";
const MAX_PAGE_SIZE = 30;
const DETAIL_BATCH_SIZE = 5;

function cloneDocument(document: GranolaDocument): GranolaDocument {
  return {
    ...document,
    folderMemberships: document.folderMemberships?.map((membership) => ({ ...membership })),
    tags: [...document.tags],
    transcriptSegments: document.transcriptSegments?.map((segment) => ({ ...segment })),
  };
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    results.push(...(await Promise.all(batch.map((item) => mapper(item)))));
  }

  return results;
}

export class GranolaPublicApiClient {
  #documentsById = new Map<string, GranolaDocument>();

  constructor(private readonly httpClient: AuthenticatedHttpClient) {}

  private async listNoteSummaries(options: {
    limit?: number;
    timeoutMs: number;
  }): Promise<PublicNoteSummary[]> {
    const notes: PublicNoteSummary[] = [];
    const pageSize = Math.max(1, Math.min(options.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE));
    let cursor: string | undefined;

    for (;;) {
      const url = new URL(PUBLIC_NOTES_URL);
      url.searchParams.set("page_size", String(pageSize));
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const response = await this.httpClient.request({
        headers: {
          Accept: "application/json",
        },
        timeoutMs: options.timeoutMs,
        url: url.toString(),
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        throw granolaClientHttpError(
          "failed to list notes",
          response.status,
          response.statusText,
          body,
        );
      }

      const payload = (await response.json()) as {
        cursor?: string | null;
        hasMore?: boolean;
        notes?: unknown[];
      };
      if (!Array.isArray(payload.notes)) {
        throw new Error("failed to parse public notes response");
      }

      notes.push(...payload.notes.map(parsePublicNoteSummary));
      cursor = payload.cursor ?? undefined;

      if (!payload.hasMore || !cursor) {
        break;
      }
    }

    return notes;
  }

  private async fetchNoteDetail(noteId: string, timeoutMs: number): Promise<GranolaDocument> {
    const url = new URL(`${PUBLIC_NOTES_URL}/${noteId}`);
    url.searchParams.append("include", "transcript");

    const response = await this.httpClient.request({
      headers: {
        Accept: "application/json",
      },
      timeoutMs,
      url: url.toString(),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);
      throw granolaClientHttpError(
        `failed to get note ${noteId}`,
        response.status,
        response.statusText,
        body,
      );
    }

    const document = parsePublicNote(await response.json());
    this.#documentsById.set(document.id, cloneDocument(document));
    return document;
  }

  async listDocuments(options: { limit?: number; timeoutMs: number }): Promise<GranolaDocument[]> {
    const summaries = await this.listNoteSummaries(options);
    const nextDocuments: GranolaDocument[] = [];
    const toFetch: PublicNoteSummary[] = [];

    for (const summary of summaries) {
      const cached = this.#documentsById.get(summary.id);
      if (cached && cached.updatedAt === summary.updatedAt) {
        nextDocuments.push(cloneDocument(cached));
        continue;
      }

      toFetch.push(summary);
    }

    const fetchedDocuments = await mapInBatches(
      toFetch,
      DETAIL_BATCH_SIZE,
      async (summary) => await this.fetchNoteDetail(summary.id, options.timeoutMs),
    );

    const fetchedById = new Map(
      fetchedDocuments.map((document) => [document.id, document] as const),
    );
    const ids = new Set<string>();

    for (const summary of summaries) {
      const document = fetchedById.get(summary.id) ?? this.#documentsById.get(summary.id);
      if (!document) {
        throw new Error(`failed to load note detail: ${summary.id}`);
      }

      ids.add(summary.id);
      nextDocuments.push(cloneDocument(document));
    }

    for (const cachedId of this.#documentsById.keys()) {
      if (!ids.has(cachedId)) {
        this.#documentsById.delete(cachedId);
      }
    }

    return nextDocuments;
  }
}
