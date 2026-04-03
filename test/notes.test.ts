import { describe, expect, test } from "vite-plus/test";

import { buildNoteExport, documentToMarkdown, renderNoteExport } from "../src/notes.ts";

describe("documentToMarkdown", () => {
  test("prefers ProseMirror content and writes YAML frontmatter", () => {
    const markdown = documentToMarkdown({
      content: "fallback content",
      createdAt: "2024-01-01T00:00:00Z",
      id: "doc-1",
      notes: {
        content: [
          { attrs: { level: 2 }, content: [{ text: "Key Points", type: "text" }], type: "heading" },
          {
            content: [
              {
                content: [{ text: "First item", type: "text" }],
                type: "listItem",
              },
            ],
            type: "bulletList",
          },
        ],
        type: "doc",
      },
      notesPlain: "",
      tags: ["work", "planning"],
      title: "Team Sync",
      updatedAt: "2024-01-02T00:00:00Z",
    });

    expect(markdown).toContain('id: "doc-1"');
    expect(markdown).toContain("# Team Sync");
    expect(markdown).toContain("## Key Points");
    expect(markdown).toContain("- First item");
    expect(markdown).not.toContain("fallback content");
  });

  test("falls back to HTML conversion when ProseMirror is unavailable", () => {
    const markdown = documentToMarkdown({
      content: "",
      createdAt: "2024-01-01T00:00:00Z",
      id: "doc-2",
      lastViewedPanel: {
        originalContent:
          '<h2>Summary</h2><p>Hello <strong>world</strong> and <a href="https://example.com">link</a></p><ol><li>Point one</li><li>Point two</li></ol>',
      },
      notesPlain: "",
      tags: [],
      title: "HTML note",
      updatedAt: "2024-01-02T00:00:00Z",
    });

    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("Hello **world**");
    expect(markdown).toContain("[link](https://example.com)");
    expect(markdown).toContain("1. Point one");
    expect(markdown).toContain("2. Point two");
  });

  test("builds structured note exports with a content source", () => {
    const note = buildNoteExport({
      content: "fallback content",
      createdAt: "2024-01-01T00:00:00Z",
      id: "doc-3",
      notes: {
        content: [{ content: [{ text: "hello", type: "text" }], type: "paragraph" }],
        type: "doc",
      },
      notesPlain: "",
      tags: [],
      title: "Structured note",
      updatedAt: "2024-01-02T00:00:00Z",
    });

    expect(note.content).toContain("hello");
    expect(note.contentSource).toBe("notes");
  });

  test("renders note exports as json", () => {
    const output = renderNoteExport(
      {
        content: "Hello",
        contentSource: "content",
        createdAt: "2024-01-01T00:00:00Z",
        id: "doc-json",
        raw: {
          content: "Hello",
          createdAt: "2024-01-01T00:00:00Z",
          id: "doc-json",
          notesPlain: "",
          tags: [],
          title: "JSON note",
          updatedAt: "2024-01-02T00:00:00Z",
        },
        tags: ["work"],
        title: "JSON note",
        updatedAt: "2024-01-02T00:00:00Z",
      },
      "json",
    );

    expect(output).toContain('"contentSource": "content"');
    expect(output).toContain('"title": "JSON note"');
  });
});
