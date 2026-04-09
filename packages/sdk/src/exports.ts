import { join } from "node:path";

import type {
  FolderRecord,
  GranolaAppApi,
  GranolaExportTarget,
  GranolaExportTargetKind,
  GranolaExportTargetsResult,
  GranolaNotesExportResult,
  GranolaTranscriptsExportResult,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "@kkarimi/gran-core";
import {
  defaultExportTargetNotesFormat,
  defaultExportTargetNotesSubdir,
  defaultExportTargetTranscriptsFormat,
  defaultExportTargetTranscriptsSubdir,
  listGranolaExportTargetDefinitions,
  type GranolaExportTargetDefinition,
} from "@kkarimi/gran-core";

type GranSdkExportTargetApi = Pick<GranolaAppApi, "listExportTargets" | "saveExportTargets">;

type GranSdkArchiveExportApi = Pick<
  GranolaAppApi,
  "exportNotes" | "exportTranscripts" | "findFolder"
>;

export interface CreateGranExportTargetOptions {
  dailyNotesDir?: string;
  id: string;
  name?: string;
  notesFormat?: NoteOutputFormat;
  notesSubdir?: string;
  outputDir: string;
  transcriptsFormat?: TranscriptOutputFormat;
  transcriptsSubdir?: string;
}

export interface GranSdkArchiveExportOptions {
  folder?: string;
  includeNotes?: boolean;
  includeTranscripts?: boolean;
  notesFormat?: NoteOutputFormat;
  notesOutputDir?: string;
  outputRoot?: string;
  targetId?: string;
  transcriptsFormat?: TranscriptOutputFormat;
  transcriptsOutputDir?: string;
}

export interface GranSdkArchiveExportResult {
  folder?: FolderRecord;
  notes?: GranolaNotesExportResult;
  transcripts?: GranolaTranscriptsExportResult;
}

export function listGranExportTargetDefinitions(): GranolaExportTargetDefinition[] {
  return listGranolaExportTargetDefinitions();
}

export function createGranExportTarget(
  kind: GranolaExportTargetKind,
  options: CreateGranExportTargetOptions,
): GranolaExportTarget {
  return {
    dailyNotesDir:
      kind === "obsidian-vault" ? options.dailyNotesDir?.trim() || undefined : undefined,
    id: options.id,
    kind,
    name: options.name?.trim() || undefined,
    notesFormat: options.notesFormat ?? defaultExportTargetNotesFormat(kind),
    notesSubdir: options.notesSubdir?.trim() || defaultExportTargetNotesSubdir(kind),
    outputDir: options.outputDir,
    transcriptsFormat: options.transcriptsFormat ?? defaultExportTargetTranscriptsFormat(kind),
    transcriptsSubdir:
      options.transcriptsSubdir?.trim() || defaultExportTargetTranscriptsSubdir(kind),
  };
}

export async function saveGranExportTarget(
  app: GranSdkExportTargetApi,
  target: GranolaExportTarget,
): Promise<GranolaExportTargetsResult> {
  const existing = await app.listExportTargets();
  const targets = [
    ...existing.targets.filter((candidate) => candidate.id !== target.id),
    { ...target },
  ].sort((left, right) => (left.name ?? left.id).localeCompare(right.name ?? right.id));

  return await app.saveExportTargets(targets);
}

export async function removeGranExportTarget(
  app: GranSdkExportTargetApi,
  targetId: string,
): Promise<GranolaExportTargetsResult> {
  const existing = await app.listExportTargets();
  return await app.saveExportTargets(
    existing.targets.filter((candidate) => candidate.id !== targetId),
  );
}

function resolveArchiveModes(options: GranSdkArchiveExportOptions): {
  includeNotes: boolean;
  includeTranscripts: boolean;
} {
  const includeNotes = options.includeNotes ?? true;
  const includeTranscripts = options.includeTranscripts ?? true;

  if (!includeNotes && !includeTranscripts) {
    throw new Error("archive export must include notes, transcripts, or both");
  }

  return {
    includeNotes,
    includeTranscripts,
  };
}

function assertCompatibleArchiveOutputs(options: GranSdkArchiveExportOptions): void {
  if (
    options.targetId &&
    (options.outputRoot || options.notesOutputDir || options.transcriptsOutputDir)
  ) {
    throw new Error(
      "cannot combine targetId with outputRoot, notesOutputDir, or transcriptsOutputDir",
    );
  }
}

export async function exportGranArchive(
  app: GranSdkArchiveExportApi,
  options: GranSdkArchiveExportOptions = {},
): Promise<GranSdkArchiveExportResult> {
  const { includeNotes, includeTranscripts } = resolveArchiveModes(options);
  assertCompatibleArchiveOutputs(options);

  const folder = options.folder ? await app.findFolder(options.folder) : undefined;
  const notesOutputDir =
    options.notesOutputDir ?? (options.outputRoot ? join(options.outputRoot, "notes") : undefined);
  const transcriptsOutputDir =
    options.transcriptsOutputDir ??
    (options.outputRoot ? join(options.outputRoot, "transcripts") : undefined);

  const notes = includeNotes
    ? await app.exportNotes(options.notesFormat, {
        folderId: folder?.id,
        outputDir: notesOutputDir,
        scopedOutput: notesOutputDir === undefined,
        targetId: options.targetId,
      })
    : undefined;

  const transcripts = includeTranscripts
    ? await app.exportTranscripts(options.transcriptsFormat, {
        folderId: folder?.id,
        outputDir: transcriptsOutputDir,
        scopedOutput: transcriptsOutputDir === undefined,
        targetId: options.targetId,
      })
    : undefined;

  return {
    folder,
    notes,
    transcripts,
  };
}
