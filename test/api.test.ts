import { describe, expect, test } from "vite-plus/test";

import { fetchDocuments, getAccessToken, parseDocument, type FetchLike } from "../src/api.ts";

describe("getAccessToken", () => {
  test("extracts the access token from supabase.json", () => {
    const token = getAccessToken(`{"workos_tokens":"{\\"access_token\\":\\"access_token_123\\"}"}`);
    expect(token).toBe("access_token_123");
  });

  test("throws when the token is missing", () => {
    expect(() => getAccessToken(`{"workos_tokens":"{\\"session_id\\":\\"abc\\"}"}`)).toThrow(
      "access token not found",
    );
  });
});

describe("parseDocument", () => {
  test("parses notes from a JSON string", () => {
    const document = parseDocument({
      content: "text",
      created_at: "2024-01-01T00:00:00Z",
      id: "doc-1",
      notes:
        '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"}]}]}',
      tags: ["work"],
      title: "Meeting",
      updated_at: "2024-01-02T00:00:00Z",
    });

    expect(document.notes?.type).toBe("doc");
    expect(document.tags).toEqual(["work"]);
  });

  test("parses last_viewed_panel content from an object", () => {
    const document = parseDocument({
      content: "",
      created_at: "2024-01-01T00:00:00Z",
      id: "doc-2",
      last_viewed_panel: {
        content: {
          content: [{ content: [{ text: "hello", type: "text" }], type: "paragraph" }],
          type: "doc",
        },
        original_content: "<p>hello</p>",
      },
      tags: [],
      title: "Meeting",
      updated_at: "2024-01-02T00:00:00Z",
    });

    expect(document.lastViewedPanel?.content?.type).toBe("doc");
    expect(document.lastViewedPanel?.originalContent).toBe("<p>hello</p>");
  });

  test("preserves calendar metadata for recurring meeting matching", () => {
    const document = parseDocument({
      content: "",
      created_at: "2024-01-01T00:00:00Z",
      google_calendar_event: {
        id: "event-123",
        recurringEventId: "recurring-456",
      },
      id: "doc-3",
      tags: [],
      title: "Recurring meeting",
      updated_at: "2024-01-02T00:00:00Z",
    });

    expect(document.calendarEvent).toEqual({
      id: "event-123",
      recurringEventId: "recurring-456",
    });
  });
});

describe("fetchDocuments", () => {
  test("handles pagination until a short page is returned", async () => {
    const calls: number[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      if (typeof init?.body !== "string") {
        throw new Error("expected request body to be a string");
      }

      const body = JSON.parse(init.body) as { offset: number };
      calls.push(body.offset);

      const docs =
        body.offset === 0
          ? Array.from({ length: 100 }, (_, index) => ({
              content: "",
              created_at: "2024-01-01T00:00:00Z",
              id: `doc-${index}`,
              tags: [],
              title: `Doc ${index}`,
              updated_at: "2024-01-02T00:00:00Z",
            }))
          : [
              {
                content: "",
                created_at: "2024-01-01T00:00:00Z",
                id: "doc-final",
                tags: [],
                title: "Final",
                updated_at: "2024-01-02T00:00:00Z",
              },
            ];

      return new Response(JSON.stringify({ docs }), { status: 200 });
    };

    const documents = await fetchDocuments({
      fetchImpl,
      supabaseContents: `{"workos_tokens":"{\\"access_token\\":\\"access_token_123\\"}"}`,
      timeoutMs: 5_000,
      url: "https://example.test/documents",
    });

    expect(documents).toHaveLength(101);
    expect(calls).toEqual([0, 100]);
  });
});
