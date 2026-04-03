import { describe, expect, test } from "vite-plus/test";

import { convertProseMirrorToMarkdown } from "../src/prosemirror.ts";

describe("convertProseMirrorToMarkdown", () => {
  test("renders nested bullet lists", () => {
    const markdown = convertProseMirrorToMarkdown({
      content: [
        {
          content: [
            {
              content: [
                {
                  content: [{ text: "Parent item", type: "text" }],
                  type: "paragraph",
                },
                {
                  content: [
                    {
                      content: [
                        {
                          content: [{ text: "Nested item", type: "text" }],
                          type: "paragraph",
                        },
                      ],
                      type: "listItem",
                    },
                  ],
                  type: "bulletList",
                },
              ],
              type: "listItem",
            },
          ],
          type: "bulletList",
        },
      ],
      type: "doc",
    });

    expect(markdown).toContain("- Parent item");
    expect(markdown).toContain("  - Nested item");
  });

  test("renders inline marks", () => {
    const markdown = convertProseMirrorToMarkdown({
      content: [
        {
          content: [
            {
              marks: [{ type: "strong" }],
              text: "Bold",
              type: "text",
            },
            {
              text: " ",
              type: "text",
            },
            {
              marks: [{ attrs: { href: "https://example.com" }, type: "link" }],
              text: "Link",
              type: "text",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    });

    expect(markdown).toContain("**Bold**");
    expect(markdown).toContain("[Link](https://example.com)");
  });

  test("renders ordered lists with a custom start index and task lists", () => {
    const markdown = convertProseMirrorToMarkdown({
      content: [
        {
          attrs: { start: 3 },
          content: [
            {
              content: [
                {
                  content: [{ text: "Third item", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "listItem",
            },
          ],
          type: "orderedList",
        },
        {
          content: [
            {
              attrs: { checked: true },
              content: [
                {
                  content: [{ text: "Done task", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "taskItem",
            },
            {
              attrs: { checked: false },
              content: [
                {
                  content: [{ text: "Todo task", type: "text" }],
                  type: "paragraph",
                },
              ],
              type: "taskItem",
            },
          ],
          type: "taskList",
        },
      ],
      type: "doc",
    });

    expect(markdown).toContain("3. Third item");
    expect(markdown).toContain("[x] Done task");
    expect(markdown).toContain("[ ] Todo task");
  });

  test("renders tables, mentions, code block languages, and escapes inline markdown", () => {
    const markdown = convertProseMirrorToMarkdown({
      content: [
        {
          content: [
            {
              content: [
                { content: [{ text: "Name", type: "text" }], type: "tableHeader" },
                { content: [{ text: "Value", type: "text" }], type: "tableHeader" },
              ],
              type: "tableRow",
            },
            {
              content: [
                {
                  content: [{ attrs: { label: "@nima" }, type: "mention" }],
                  type: "tableCell",
                },
                {
                  content: [{ text: "a|b", type: "text" }],
                  type: "tableCell",
                },
              ],
              type: "tableRow",
            },
          ],
          type: "table",
        },
        {
          content: [{ text: "literal *stars* [link]", type: "text" }],
          type: "paragraph",
        },
        {
          attrs: { language: "ts" },
          content: [{ text: "const value = 1;", type: "text" }],
          type: "codeBlock",
        },
      ],
      type: "doc",
    });

    expect(markdown).toContain("| Name | Value |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| @nima | a\\|b |");
    expect(markdown).toContain("literal \\*stars\\* \\[link\\]");
    expect(markdown).toContain("```ts");
    expect(markdown).toContain("const value = 1;");
  });
});
