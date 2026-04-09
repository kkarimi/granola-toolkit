import { createHash } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import type { ExportStateEntry, ExportStateFile, ExportStateKind } from "./types.ts";
import {
  asRecord,
  ensureDirectory,
  makeUniqueFilename,
  parseJsonString,
  readUtf8,
  stringValue,
  writeTextFile,
} from "./utils.ts";

const EXPORT_STATE_VERSION = 1;

interface ManagedExportItem {
  content: string;
  extension: string;
  id: string;
  preferredStem: string;
  relativeDir?: string;
  sourceUpdatedAt: string;
}

interface ManagedExportPlan {
  content: string;
  contentHash: string;
  existing?: ExportStateEntry;
  fileName: string;
  fileStem: string;
  id: string;
  relativeDir?: string;
  sourceUpdatedAt: string;
}

function exportStatePath(outputDir: string, kind: ExportStateKind): string {
  return join(outputDir, `.gran-${kind}-state.json`);
}

function legacyExportStatePath(outputDir: string, kind: ExportStateKind): string {
  return join(outputDir, `.granola-toolkit-${kind}-state.json`);
}

function emptyExportState(kind: ExportStateKind): ExportStateFile {
  return {
    entries: {},
    kind,
    version: EXPORT_STATE_VERSION,
  };
}

function normaliseExportState(parsed: unknown, kind: ExportStateKind): ExportStateFile {
  const record = asRecord(parsed);
  if (!record || record.version !== EXPORT_STATE_VERSION || record.kind !== kind) {
    return emptyExportState(kind);
  }

  const rawEntries = asRecord(record.entries) ?? {};
  const entries = Object.fromEntries(
    Object.entries(rawEntries)
      .map(([id, entry]) => {
        const value = asRecord(entry);
        if (!value) {
          return undefined;
        }

        const fileName = stringValue(value.fileName);
        const fileStem = stringValue(value.fileStem);
        if (!fileName || !fileStem) {
          return undefined;
        }

        const normalisedEntry: ExportStateEntry = {
          contentHash: stringValue(value.contentHash),
          exportedAt: stringValue(value.exportedAt),
          fileName,
          fileStem,
          sourceUpdatedAt: stringValue(value.sourceUpdatedAt),
        };

        return [id, normalisedEntry] as const;
      })
      .filter((entry): entry is readonly [string, ExportStateEntry] => Boolean(entry)),
  );

  return {
    entries,
    kind,
    version: EXPORT_STATE_VERSION,
  };
}

async function loadExportState(outputDir: string, kind: ExportStateKind): Promise<ExportStateFile> {
  for (const statePath of [
    exportStatePath(outputDir, kind),
    legacyExportStatePath(outputDir, kind),
  ]) {
    try {
      const raw = await readUtf8(statePath);
      const parsed = parseJsonString<unknown>(raw);
      return normaliseExportState(parsed, kind);
    } catch {
      continue;
    }
  }

  return emptyExportState(kind);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function reserveStem(
  usedByDirectory: Map<string, Map<string, number>>,
  preferredStem: string,
  relativeDir: string | undefined,
  existingStem?: string,
): string {
  const bucketKey = relativeDir?.trim() || ".";
  const used = usedByDirectory.get(bucketKey) ?? new Map<string, number>();
  usedByDirectory.set(bucketKey, used);

  if (existingStem && (used.get(existingStem) ?? 0) === 0) {
    used.set(existingStem, 1);
    return existingStem;
  }

  return makeUniqueFilename(preferredStem, used);
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch {
    return false;
  }
}

function entryChanged(left: ExportStateEntry | undefined, right: ExportStateEntry): boolean {
  if (!left) {
    return true;
  }

  return (
    left.contentHash !== right.contentHash ||
    left.exportedAt !== right.exportedAt ||
    left.fileName !== right.fileName ||
    left.fileStem !== right.fileStem ||
    left.sourceUpdatedAt !== right.sourceUpdatedAt
  );
}

export async function syncManagedExports({
  items,
  kind,
  onProgress,
  outputDir,
}: {
  items: ManagedExportItem[];
  kind: ExportStateKind;
  onProgress?: (progress: {
    completed: number;
    total: number;
    written: number;
  }) => Promise<void> | void;
  outputDir: string;
}): Promise<number> {
  await ensureDirectory(outputDir);

  const currentState = await loadExportState(outputDir, kind);
  const previousEntries = currentState.entries;
  const usedByDirectory = new Map<string, Map<string, number>>();
  const plans: ManagedExportPlan[] = items.map((item) => {
    const existing = previousEntries[item.id];
    const relativeDir = item.relativeDir?.trim() || undefined;
    const fileStem = reserveStem(
      usedByDirectory,
      item.preferredStem,
      relativeDir,
      existing?.fileStem,
    );
    const fileName = relativeDir
      ? join(relativeDir, `${fileStem}${item.extension}`)
      : `${fileStem}${item.extension}`;

    return {
      content: item.content,
      contentHash: hashContent(item.content),
      existing,
      fileName,
      fileStem,
      id: item.id,
      relativeDir,
      sourceUpdatedAt: item.sourceUpdatedAt,
    };
  });

  const activeIds = new Set(plans.map((plan) => plan.id));
  const activeFileNames = new Set(plans.map((plan) => plan.fileName));
  const exportedAt = new Date().toISOString();
  const nextEntries: Record<string, ExportStateEntry> = {};
  let completed = 0;
  let written = 0;
  let stateChanged = false;

  for (const plan of plans) {
    const filePath = join(outputDir, plan.fileName);
    const shouldWrite =
      !plan.existing ||
      plan.existing.contentHash !== plan.contentHash ||
      plan.existing.fileName !== plan.fileName ||
      !(await fileExists(filePath));

    if (shouldWrite) {
      await writeTextFile(filePath, plan.content);
      written += 1;
    }

    const nextEntry: ExportStateEntry = {
      contentHash: plan.contentHash,
      exportedAt: shouldWrite ? exportedAt : (plan.existing?.exportedAt ?? exportedAt),
      fileName: plan.fileName,
      fileStem: plan.fileStem,
      sourceUpdatedAt: plan.sourceUpdatedAt,
    };

    nextEntries[plan.id] = nextEntry;
    stateChanged = stateChanged || entryChanged(plan.existing, nextEntry);
    completed += 1;

    if (onProgress) {
      await onProgress({
        completed,
        total: plans.length,
        written,
      });
    }
  }

  for (const plan of plans) {
    const previousFileName = plan.existing?.fileName;
    if (
      previousFileName &&
      previousFileName !== plan.fileName &&
      !activeFileNames.has(previousFileName)
    ) {
      await rm(join(outputDir, previousFileName), { force: true });
      stateChanged = true;
    }
  }

  for (const [id, entry] of Object.entries(previousEntries)) {
    if (activeIds.has(id)) {
      continue;
    }

    if (!activeFileNames.has(entry.fileName)) {
      await rm(join(outputDir, entry.fileName), { force: true });
    }

    stateChanged = true;
  }

  const nextState: ExportStateFile = {
    entries: nextEntries,
    kind,
    version: EXPORT_STATE_VERSION,
  };
  const serialisedState = `${JSON.stringify(nextState, null, 2)}\n`;
  const statePath = exportStatePath(outputDir, kind);
  const existingState = (await fileExists(statePath)) ? await readUtf8(statePath) : undefined;

  if (stateChanged || existingState !== serialisedState) {
    await writeTextFile(statePath, serialisedState);
  }

  return written;
}
