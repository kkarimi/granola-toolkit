import { describe, expect, test } from "vite-plus/test";

import { CachedTokenProvider } from "../src/client/auth.ts";
import { GranolaApiClient } from "../src/client/granola.ts";
import { AuthenticatedHttpClient } from "../src/client/http.ts";

describe("GranolaApiClient", () => {
  test("sends the configured client version headers", async () => {
    const client = new GranolaApiClient(
      new AuthenticatedHttpClient({
        fetchImpl: async (_url, init) => {
          const headers = new Headers(init?.headers);

          expect(headers.get("user-agent")).toBe("Granola/9.9.9");
          expect(headers.get("x-client-version")).toBe("9.9.9");

          return new Response(JSON.stringify({ docs: [] }), { status: 200 });
        },
        tokenProvider: new CachedTokenProvider({
          async loadAccessToken() {
            return "token-1";
          },
        }),
      }),
      {
        clientVersion: "9.9.9",
        documentsUrl: "https://example.test/documents",
      },
    );

    const documents = await client.listDocuments({ timeoutMs: 5_000 });

    expect(documents).toEqual([]);
  });

  test("falls back to the v1 folder endpoint and parses document ids", async () => {
    const urls: string[] = [];
    const client = new GranolaApiClient(
      new AuthenticatedHttpClient({
        fetchImpl: async (url, init) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
          urls.push(requestUrl);
          const headers = new Headers(init?.headers);

          expect(headers.get("user-agent")).toBe("Granola/9.9.9");
          expect(headers.get("x-client-version")).toBe("9.9.9");

          if (requestUrl.includes("/v2/get-document-lists")) {
            return new Response("missing", { status: 404, statusText: "Not Found" });
          }

          return new Response(
            JSON.stringify({
              lists: [
                {
                  created_at: "2024-01-01T00:00:00Z",
                  document_ids: ["doc-alpha", { document_id: "doc-bravo" }],
                  id: "folder-1",
                  is_favourite: true,
                  name: "Customer Calls",
                  updated_at: "2024-01-03T00:00:00Z",
                },
              ],
            }),
            { status: 200 },
          );
        },
        tokenProvider: new CachedTokenProvider({
          async loadAccessToken() {
            return "token-1";
          },
        }),
      }),
      {
        clientVersion: "9.9.9",
        documentsUrl: "https://example.test/documents",
      },
    );

    const folders = await client.listFolders({ timeoutMs: 5_000 });

    expect(urls).toEqual([
      "https://api.granola.ai/v2/get-document-lists",
      "https://api.granola.ai/v1/get-document-lists",
    ]);
    expect(folders).toEqual([
      expect.objectContaining({
        documentIds: ["doc-alpha", "doc-bravo"],
        id: "folder-1",
        isFavourite: true,
        name: "Customer Calls",
      }),
    ]);
  });

  test("loads transcript segments from the document transcript endpoint", async () => {
    const client = new GranolaApiClient(
      new AuthenticatedHttpClient({
        fetchImpl: async (url, init) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
          expect(requestUrl).toBe("https://api.granola.ai/v1/get-document-transcript");

          const headers = new Headers(init?.headers);
          expect(headers.get("user-agent")).toBe("Granola/9.9.9");
          expect(headers.get("x-client-version")).toBe("9.9.9");

          return new Response(
            JSON.stringify([
              {
                document_id: "doc-alpha",
                end_timestamp: "2024-01-01T09:00:04Z",
                id: "segment-1",
                is_final: true,
                source: "microphone",
                start_timestamp: "2024-01-01T09:00:01Z",
                text: "Hello from Granola",
              },
            ]),
            { status: 200 },
          );
        },
        tokenProvider: new CachedTokenProvider({
          async loadAccessToken() {
            return "token-1";
          },
        }),
      }),
      {
        clientVersion: "9.9.9",
        documentsUrl: "https://example.test/documents",
      },
    );

    const transcript = await client.getDocumentTranscript("doc-alpha", {
      timeoutMs: 5_000,
    });

    expect(transcript).toEqual([
      {
        documentId: "doc-alpha",
        endTimestamp: "2024-01-01T09:00:04Z",
        id: "segment-1",
        isFinal: true,
        source: "microphone",
        startTimestamp: "2024-01-01T09:00:01Z",
        text: "Hello from Granola",
      },
    ]);
  });
});
