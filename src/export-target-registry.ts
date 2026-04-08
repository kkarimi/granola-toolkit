import type { GranolaExportTargetKind } from "./app/index.ts";
import type { NoteOutputFormat, TranscriptOutputFormat } from "./types.ts";
import { GranolaCapabilityRegistry } from "./registry.ts";

export interface GranolaExportTargetDefinition {
  defaultNotesFormat: NoteOutputFormat;
  defaultNotesSubdir: string;
  defaultTranscriptsFormat: TranscriptOutputFormat;
  defaultTranscriptsSubdir: string;
  description: string;
  kind: GranolaExportTargetKind;
  label: string;
  supportsDailyNotes?: boolean;
}

export type GranolaExportTargetRegistry = GranolaCapabilityRegistry<
  GranolaExportTargetKind,
  GranolaExportTargetDefinition
>;

export function createGranolaExportTargetRegistry(): GranolaExportTargetRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaExportTargetRegistry(): GranolaExportTargetRegistry {
  return createGranolaExportTargetRegistry()
    .register("bundle-folder", {
      defaultNotesFormat: "markdown",
      defaultNotesSubdir: "notes",
      defaultTranscriptsFormat: "text",
      defaultTranscriptsSubdir: "transcripts",
      description: "A plain local archive with one notes folder and one transcripts folder.",
      kind: "bundle-folder",
      label: "Bundle folder",
    })
    .register("obsidian-vault", {
      defaultNotesFormat: "markdown",
      defaultNotesSubdir: "Meetings",
      defaultTranscriptsFormat: "markdown",
      defaultTranscriptsSubdir: "Meeting Transcripts",
      description:
        "An Obsidian-friendly vault target with markdown notes, markdown transcripts, and optional daily-note links.",
      kind: "obsidian-vault",
      label: "Obsidian vault",
      supportsDailyNotes: true,
    });
}

const defaultRegistry = createDefaultGranolaExportTargetRegistry();

export function listGranolaExportTargetDefinitions(): GranolaExportTargetDefinition[] {
  return defaultRegistry.entries().map(([, definition]) => ({ ...definition }));
}

export function resolveGranolaExportTargetDefinition(
  kind: GranolaExportTargetKind,
): GranolaExportTargetDefinition {
  return { ...defaultRegistry.resolve(kind, "export target") };
}

export function parseGranolaExportTargetKind(value: unknown): GranolaExportTargetKind | undefined {
  const kind = typeof value === "string" ? value.trim() : "";
  if (!kind) {
    return undefined;
  }

  return listGranolaExportTargetDefinitions().some((definition) => definition.kind === kind)
    ? (kind as GranolaExportTargetKind)
    : undefined;
}

export function defaultExportTargetNotesSubdir(kind: GranolaExportTargetKind): string {
  return resolveGranolaExportTargetDefinition(kind).defaultNotesSubdir;
}

export function defaultExportTargetTranscriptsSubdir(kind: GranolaExportTargetKind): string {
  return resolveGranolaExportTargetDefinition(kind).defaultTranscriptsSubdir;
}

export function defaultExportTargetNotesFormat(kind: GranolaExportTargetKind): NoteOutputFormat {
  return resolveGranolaExportTargetDefinition(kind).defaultNotesFormat;
}

export function defaultExportTargetTranscriptsFormat(
  kind: GranolaExportTargetKind,
): TranscriptOutputFormat {
  return resolveGranolaExportTargetDefinition(kind).defaultTranscriptsFormat;
}
