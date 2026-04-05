import { describe, expect, test } from "vite-plus/test";

import {
  extractChangelogEntry,
  groupedReleaseChanges,
  parseCommitSubject,
  releaseSectionForType,
  renderReleaseEntry,
  stripChangelogEntry,
} from "../scripts/release-data.mjs";

describe("parseCommitSubject", () => {
  test("parses semantic commit subjects into type and summary", () => {
    expect(parseCommitSubject("feat(web): simplify onboarding flow")).toEqual({
      breaking: false,
      summary: "simplify onboarding flow",
      type: "feat",
    });
  });

  test("falls back to other for non-semantic subjects", () => {
    expect(parseCommitSubject("ship it")).toEqual({
      breaking: false,
      summary: "ship it",
      type: "other",
    });
  });
});

describe("releaseSectionForType", () => {
  test("maps semantic types into stable release sections", () => {
    expect(releaseSectionForType("feat")).toBe("Features");
    expect(releaseSectionForType("fix")).toBe("Fixes");
    expect(releaseSectionForType("refactor")).toBe("Improvements");
    expect(releaseSectionForType("docs")).toBe("Docs");
    expect(releaseSectionForType("test")).toBe("Testing");
    expect(releaseSectionForType("chore")).toBe("Internal");
    expect(releaseSectionForType("unknown")).toBe("Other");
  });
});

describe("groupedReleaseChanges", () => {
  test("keeps section ordering stable and skips empty groups", () => {
    const groups = groupedReleaseChanges([
      {
        breaking: false,
        hash: "a".repeat(40),
        section: "Testing",
        shortHash: "aaaaaaa",
        subject: "test: add coverage",
        summary: "add coverage",
        type: "test",
      },
      {
        breaking: false,
        hash: "b".repeat(40),
        section: "Features",
        shortHash: "bbbbbbb",
        subject: "feat: add releases page",
        summary: "add releases page",
        type: "feat",
      },
    ]);

    expect(groups).toEqual([
      {
        changes: [
          expect.objectContaining({
            summary: "add releases page",
          }),
        ],
        section: "Features",
      },
      {
        changes: [
          expect.objectContaining({
            summary: "add coverage",
          }),
        ],
        section: "Testing",
      },
    ]);
  });
});

describe("renderReleaseEntry", () => {
  test("renders grouped sections and release artefacts", () => {
    const markdown = renderReleaseEntry({
      baseTag: "v0.61.0",
      changes: [
        {
          breaking: false,
          hash: "a".repeat(40),
          section: "Features",
          shortHash: "aaaaaaa",
          subject: "feat: add releases page",
          summary: "add releases page",
          type: "feat",
        },
        {
          breaking: false,
          hash: "b".repeat(40),
          section: "Fixes",
          shortHash: "bbbbbbb",
          subject: "fix: refresh release notes on edits",
          summary: "refresh release notes on edits",
          type: "fix",
        },
      ],
      date: "2026-04-05",
      homepage: "https://kkarimi.github.io/granola-toolkit/",
      packageName: "granola-toolkit",
      repository: "https://github.com/kkarimi/granola-toolkit",
      version: "0.62.0",
    });

    expect(markdown).toContain("## 0.62.0 - 2026-04-05");
    expect(markdown).toContain("### Highlights");
    expect(markdown).toContain("### Features");
    expect(markdown).toContain("### Fixes");
    expect(markdown).toContain(
      "https://github.com/kkarimi/granola-toolkit/compare/v0.61.0...v0.62.0",
    );
  });
});

describe("changelog extraction", () => {
  test("extracts and replaces one entry without touching the others", () => {
    const original = `# Changelog

All notable changes to \`granola-toolkit\` are recorded here.

## 0.62.0 - 2026-04-05

### Features

- add releases page

## 0.61.0 - 2026-04-05

### Fixes

- refresh release notes on edits
`;

    expect(extractChangelogEntry(original, "0.62.0")).toContain("### Features");
    expect(stripChangelogEntry(original, "0.62.0")).not.toContain("## 0.62.0 - 2026-04-05");
    expect(stripChangelogEntry(original, "0.62.0")).toContain("## 0.61.0 - 2026-04-05");
  });
});
