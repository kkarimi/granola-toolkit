import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { GranolaExportScope, GranolaExportTarget } from "./app/index.ts";
import { resolveExportOutputDir } from "./export-scope.ts";
import {
  defaultExportTargetNotesSubdir,
  defaultExportTargetTranscriptsSubdir,
  parseGranolaExportTargetKind,
} from "./export-target-registry.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import type { NoteOutputFormat, TranscriptOutputFormat } from "./types.ts";
import { asRecord, parseJsonString, stringValue } from "./utils.ts";

interface ExportTargetsFile {
  targets: GranolaExportTarget[];
}

function cloneTarget(target: GranolaExportTarget): GranolaExportTarget {
  return { ...target };
}

function parseNoteFormat(value: unknown): NoteOutputFormat | undefined {
  const format = stringValue(value).trim();
  return format === "json" || format === "markdown" || format === "raw" || format === "yaml"
    ? format
    : undefined;
}

function parseTranscriptFormat(value: unknown): TranscriptOutputFormat | undefined {
  const format = stringValue(value).trim();
  return format === "json" ||
    format === "markdown" ||
    format === "raw" ||
    format === "text" ||
    format === "yaml"
    ? format
    : undefined;
}

function normaliseTarget(value: unknown): GranolaExportTarget | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = stringValue(record.id).trim();
  const outputDir = stringValue(record.outputDir).trim();
  const kind = parseGranolaExportTargetKind(record.kind);
  if (!id || !outputDir || !kind) {
    return undefined;
  }

  return {
    dailyNotesDir: stringValue(record.dailyNotesDir).trim() || undefined,
    id,
    kind,
    name: stringValue(record.name).trim() || undefined,
    notesFormat: parseNoteFormat(record.notesFormat),
    notesSubdir: stringValue(record.notesSubdir).trim() || undefined,
    outputDir,
    transcriptsFormat: parseTranscriptFormat(record.transcriptsFormat),
    transcriptsSubdir: stringValue(record.transcriptsSubdir).trim() || undefined,
  };
}

function normaliseFile(parsed: unknown): ExportTargetsFile {
  const record = asRecord(parsed);
  if (!record || !Array.isArray(record.targets)) {
    return { targets: [] };
  }

  return {
    targets: record.targets
      .map((target) => normaliseTarget(target))
      .filter((target): target is GranolaExportTarget => Boolean(target)),
  };
}

export function resolveExportTargetSubdir(
  target: GranolaExportTarget,
  kind: "notes" | "transcripts",
): string {
  if (kind === "notes") {
    return target.notesSubdir?.trim() || defaultExportTargetNotesSubdir(target.kind);
  }

  return target.transcriptsSubdir?.trim() || defaultExportTargetTranscriptsSubdir(target.kind);
}

export function resolveExportTargetOutputDir(
  target: GranolaExportTarget,
  kind: "notes" | "transcripts",
  scope: GranolaExportScope,
  options: { scopedDirectory?: boolean } = {},
): string {
  return resolveExportOutputDir(
    join(target.outputDir, resolveExportTargetSubdir(target, kind)),
    scope,
    {
      scopedDirectory: options.scopedDirectory,
    },
  );
}

export interface ExportTargetStore {
  readTargets(): Promise<GranolaExportTarget[]>;
  writeTargets(targets: GranolaExportTarget[]): Promise<void>;
}

export class MemoryExportTargetStore implements ExportTargetStore {
  constructor(private readonly targets: GranolaExportTarget[] = []) {}

  async readTargets(): Promise<GranolaExportTarget[]> {
    return this.targets.map((target) => cloneTarget(target));
  }

  async writeTargets(targets: GranolaExportTarget[]): Promise<void> {
    this.targets.splice(0, this.targets.length, ...targets.map((target) => cloneTarget(target)));
  }
}

export class FileExportTargetStore implements ExportTargetStore {
  constructor(private readonly filePath: string = defaultExportTargetsFilePath()) {}

  async readTargets(): Promise<GranolaExportTarget[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return normaliseFile(parseJsonString(contents)).targets.map((target) => cloneTarget(target));
    } catch {
      return [];
    }
  }

  async writeTargets(targets: GranolaExportTarget[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify({ targets }, null, 2)}\n`, "utf8");
  }
}

export function defaultExportTargetsFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().exportTargetsFile;
}

export function createDefaultExportTargetStore(filePath?: string): ExportTargetStore {
  return new FileExportTargetStore(filePath);
}
