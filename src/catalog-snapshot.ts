import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import type { CacheData, GranolaDocument, GranolaFolder } from "./types.ts";
import { parseJsonString } from "./utils.ts";

const GRANOLA_CATALOG_SNAPSHOT_VERSION = 1;

export interface GranolaCatalogSnapshot {
  cacheData?: CacheData;
  documents: GranolaDocument[];
  folders?: GranolaFolder[];
  updatedAt: string;
}

interface GranolaCatalogSnapshotFile {
  cacheData?: CacheData;
  documents: GranolaDocument[];
  folders?: GranolaFolder[];
  updatedAt: string;
  version: number;
}

export interface CatalogSnapshotStore {
  readSnapshot(): Promise<GranolaCatalogSnapshot | undefined>;
  writeSnapshot(snapshot: GranolaCatalogSnapshot): Promise<void>;
}

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}

function normaliseSnapshot(
  snapshot: GranolaCatalogSnapshot | GranolaCatalogSnapshotFile,
): GranolaCatalogSnapshot {
  return cloneSnapshot({
    cacheData: snapshot.cacheData,
    documents: Array.isArray(snapshot.documents) ? snapshot.documents : [],
    folders: Array.isArray(snapshot.folders) ? snapshot.folders : undefined,
    updatedAt: snapshot.updatedAt,
  });
}

export class MemoryCatalogSnapshotStore implements CatalogSnapshotStore {
  #snapshot?: GranolaCatalogSnapshot;

  constructor(snapshot?: GranolaCatalogSnapshot) {
    this.#snapshot = snapshot ? normaliseSnapshot(snapshot) : undefined;
  }

  async readSnapshot(): Promise<GranolaCatalogSnapshot | undefined> {
    return this.#snapshot ? cloneSnapshot(this.#snapshot) : undefined;
  }

  async writeSnapshot(snapshot: GranolaCatalogSnapshot): Promise<void> {
    this.#snapshot = normaliseSnapshot(snapshot);
  }
}

export class FileCatalogSnapshotStore implements CatalogSnapshotStore {
  constructor(private readonly filePath: string = defaultCatalogSnapshotFilePath()) {}

  async readSnapshot(): Promise<GranolaCatalogSnapshot | undefined> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<GranolaCatalogSnapshotFile>(contents);
      if (
        !parsed ||
        parsed.version !== GRANOLA_CATALOG_SNAPSHOT_VERSION ||
        !Array.isArray(parsed.documents) ||
        typeof parsed.updatedAt !== "string"
      ) {
        return undefined;
      }

      return normaliseSnapshot(parsed);
    } catch {
      return undefined;
    }
  }

  async writeSnapshot(snapshot: GranolaCatalogSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const payload: GranolaCatalogSnapshotFile = {
      ...normaliseSnapshot(snapshot),
      version: GRANOLA_CATALOG_SNAPSHOT_VERSION,
    };
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export function defaultCatalogSnapshotFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().catalogSnapshotFile;
}

export function createDefaultCatalogSnapshotStore(): CatalogSnapshotStore {
  return new FileCatalogSnapshotStore();
}
