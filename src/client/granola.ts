import type { GranolaDocument } from "../types.ts";

import { parseDocument } from "./parsers.ts";
import type { AuthenticatedHttpClient } from "./http.ts";

const USER_AGENT = "Granola/5.354.0";
const CLIENT_VERSION = "5.354.0";
const DOCUMENTS_URL = "https://api.granola.ai/v2/get-documents";

export class GranolaApiClient {
  constructor(
    private readonly httpClient: AuthenticatedHttpClient,
    private readonly documentsUrl = DOCUMENTS_URL,
  ) {}

  async listDocuments(options: { limit?: number; timeoutMs: number }): Promise<GranolaDocument[]> {
    const documents: GranolaDocument[] = [];
    const limit = options.limit ?? 100;
    let offset = 0;

    for (;;) {
      const response = await this.httpClient.postJson(
        this.documentsUrl,
        {
          include_last_viewed_panel: true,
          limit,
          offset,
        },
        {
          headers: {
            "User-Agent": USER_AGENT,
            "X-Client-Version": CLIENT_VERSION,
          },
          timeoutMs: options.timeoutMs,
        },
      );

      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        throw new Error(
          `failed to get documents: ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`,
        );
      }

      const payload = (await response.json()) as { docs?: unknown[] };
      if (!Array.isArray(payload.docs)) {
        throw new Error("failed to parse documents response");
      }

      const page = payload.docs.map(parseDocument);
      documents.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += limit;
    }

    return documents;
  }
}
