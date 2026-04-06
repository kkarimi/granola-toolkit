import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { FileCatalogSnapshotStore, MemoryCatalogSnapshotStore } from "../src/catalog-snapshot.ts";
import type { GranolaCatalogSnapshot } from "../src/catalog-snapshot.ts";

const snapshot: GranolaCatalogSnapshot = {
  cacheData: {
    documents: {
      "doc-alpha-1111": {
        createdAt: "2024-01-01T09:00:00Z",
        id: "doc-alpha-1111",
        title: "Alpha Sync",
        updatedAt: "2024-01-03T10:00:00Z",
      },
    },
    transcripts: {
      "doc-alpha-1111": [
        {
          documentId: "doc-alpha-1111",
          endTimestamp: "2024-01-01T09:00:03Z",
          id: "segment-1",
          isFinal: true,
          source: "microphone",
          startTimestamp: "2024-01-01T09:00:01Z",
          text: "Hello team",
        },
      ],
    },
  },
  documents: [
    {
      content: "Fallback note body",
      createdAt: "2024-01-01T09:00:00Z",
      id: "doc-alpha-1111",
      notesPlain: "Alpha notes",
      tags: ["team"],
      title: "Alpha Sync",
      updatedAt: "2024-01-03T10:00:00Z",
    },
  ],
  folders: [
    {
      createdAt: "2024-01-01T08:00:00Z",
      documentIds: ["doc-alpha-1111"],
      id: "folder-team-1111",
      isFavourite: true,
      name: "Team",
      updatedAt: "2024-01-04T10:00:00Z",
      workspaceId: "workspace-1",
    },
  ],
  updatedAt: "2024-03-01T12:00:00Z",
};

describe("catalog snapshot stores", () => {
  test("memory store clones values on read and write", async () => {
    const store = new MemoryCatalogSnapshotStore(snapshot);
    const firstRead = await store.readSnapshot();
    const secondRead = await store.readSnapshot();

    expect(firstRead).toEqual(snapshot);
    expect(secondRead).toEqual(snapshot);
    expect(firstRead).not.toBe(snapshot);

    firstRead?.documents.push({
      content: "",
      createdAt: "2024-01-02T09:00:00Z",
      id: "doc-mutated",
      notesPlain: "",
      tags: [],
      title: "Mutated",
      updatedAt: "2024-01-02T10:00:00Z",
    });

    expect((await store.readSnapshot())?.documents).toHaveLength(1);
  });

  test("file store persists a versioned snapshot on disk", async () => {
    const directory = await mkdtemp(join(tmpdir(), "granola-catalog-snapshot-"));
    const filePath = join(directory, "catalog-snapshot.json");
    const store = new FileCatalogSnapshotStore(filePath);

    await store.writeSnapshot(snapshot);

    const raw = JSON.parse(await readFile(filePath, "utf8")) as { version?: number };
    const roundTrip = await store.readSnapshot();

    expect(raw.version).toBe(1);
    expect(roundTrip).toEqual(snapshot);
  });
});
