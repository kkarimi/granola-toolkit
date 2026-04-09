import { access, mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { syncManagedExports } from "../src/export-state.ts";
import { writeNotes } from "../src/notes.ts";
import { writeTranscripts } from "../src/transcripts.ts";

async function exists(pathname: string): Promise<boolean> {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

describe("export state", () => {
  test("keeps note filenames stable and skips rewrites when content is unchanged", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "gran-notes-"));
    const alphaPath = join(outputDir, "Alpha.md");
    const statePath = join(outputDir, ".gran-notes-state.json");

    const initialCount = await writeNotes(
      [
        {
          content: "Same body",
          createdAt: "2024-01-01T00:00:00Z",
          id: "doc-1",
          notesPlain: "",
          tags: [],
          title: "Alpha",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ],
      outputDir,
    );

    expect(initialCount).toBe(1);
    expect(await exists(alphaPath)).toBe(true);
    expect(await exists(statePath)).toBe(true);

    const firstStat = await stat(alphaPath);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const unchangedCount = await writeNotes(
      [
        {
          content: "Same body",
          createdAt: "2024-01-01T00:00:00Z",
          id: "doc-1",
          lastViewedPanel: {
            updatedAt: "2024-01-03T00:00:00Z",
          },
          notesPlain: "",
          tags: [],
          title: "Alpha",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ],
      outputDir,
    );

    const secondStat = await stat(alphaPath);

    expect(unchangedCount).toBe(0);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const renamedCount = await writeNotes(
      [
        {
          content: "Same body",
          createdAt: "2024-01-01T00:00:00Z",
          id: "doc-1",
          notesPlain: "",
          tags: [],
          title: "Renamed",
          updatedAt: "2024-01-04T00:00:00Z",
        },
      ],
      outputDir,
    );

    expect(renamedCount).toBe(1);
    expect(await exists(alphaPath)).toBe(true);
    expect(await exists(join(outputDir, "Renamed.md"))).toBe(false);
    expect(await readFile(alphaPath, "utf8")).toContain("# Renamed");

    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      entries: Record<string, { fileName: string }>;
    };
    expect(state.entries["doc-1"]?.fileName).toBe("Alpha.md");
  });

  test("migrates transcript extensions and deletes stale files", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "gran-transcripts-"));
    const textPath = join(outputDir, "Meeting.txt");
    const jsonPath = join(outputDir, "Meeting.json");
    const statePath = join(outputDir, ".gran-transcripts-state.json");

    const cacheData = {
      documents: {
        "doc-1": {
          createdAt: "2024-01-01T00:00:00Z",
          id: "doc-1",
          title: "Meeting",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      },
      transcripts: {
        "doc-1": [
          {
            documentId: "doc-1",
            endTimestamp: "2024-01-01T10:00:05Z",
            id: "seg-1",
            isFinal: true,
            source: "system",
            startTimestamp: "2024-01-01T10:00:00Z",
            text: "Hello",
          },
        ],
      },
    };

    expect(await writeTranscripts(cacheData, outputDir, "text")).toBe(1);
    expect(await exists(textPath)).toBe(true);
    expect(await exists(statePath)).toBe(true);

    expect(await writeTranscripts(cacheData, outputDir, "json")).toBe(1);
    expect(await exists(textPath)).toBe(false);
    expect(await exists(jsonPath)).toBe(true);

    expect(
      await writeTranscripts(
        {
          documents: {},
          transcripts: {},
        },
        outputDir,
        "json",
      ),
    ).toBe(0);

    expect(await exists(jsonPath)).toBe(false);

    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      entries: Record<string, unknown>;
    };
    expect(state.entries).toEqual({});
  });

  test("tracks nested relative directories and removes moved files", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "gran-managed-nested-"));
    const firstPath = join(outputDir, "Meetings", "Team", "Alpha.md");
    const movedPath = join(outputDir, "Meetings", "Archive", "Alpha.md");
    const statePath = join(outputDir, ".gran-notes-state.json");

    expect(
      await syncManagedExports({
        items: [
          {
            content: "# Alpha",
            extension: ".md",
            id: "note-1",
            preferredStem: "Alpha",
            relativeDir: join("Meetings", "Team"),
            sourceUpdatedAt: "2024-01-01T00:00:00Z",
          },
        ],
        kind: "notes",
        outputDir,
      }),
    ).toBe(1);

    expect(await exists(firstPath)).toBe(true);

    expect(
      await syncManagedExports({
        items: [
          {
            content: "# Alpha",
            extension: ".md",
            id: "note-1",
            preferredStem: "Alpha",
            relativeDir: join("Meetings", "Archive"),
            sourceUpdatedAt: "2024-01-02T00:00:00Z",
          },
        ],
        kind: "notes",
        outputDir,
      }),
    ).toBe(1);

    expect(await exists(firstPath)).toBe(false);
    expect(await exists(movedPath)).toBe(true);

    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      entries: Record<string, { fileName: string }>;
    };
    expect(state.entries["note-1"]?.fileName).toBe(join("Meetings", "Archive", "Alpha.md"));
  });
});
