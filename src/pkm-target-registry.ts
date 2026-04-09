import type { GranolaPkmTarget, GranolaPkmTargetKind } from "./app/index.ts";
import { GranolaCapabilityRegistry } from "./registry.ts";
import { sanitiseFilename } from "./utils.ts";

export type GranolaPkmTargetTransport = "api" | "filesystem";
export type GranolaPkmTargetReviewMode = "optional" | "recommended" | "required";

export interface GranolaPkmTargetDefinition {
  defaultNotesSubdir: string;
  defaultTranscriptsSubdir: string;
  description: string;
  kind: GranolaPkmTargetKind;
  label: string;
  reviewMode: GranolaPkmTargetReviewMode;
  supportsDailyNotes?: boolean;
  supportsFolderSubdirectories?: boolean;
  supportsFrontmatter?: boolean;
  supportsOpenInApp?: boolean;
  transport: GranolaPkmTargetTransport;
}

export interface GranolaPkmPublishIdentity {
  fileName: string;
  key: string;
  preferredStem: string;
}

export interface GranolaPkmPublishIdentityInput {
  actionId?: string;
  artifactKind: string;
  meetingId: string;
  meetingTitle: string;
  target: Pick<GranolaPkmTarget, "filenameTemplate" | "id">;
}

export type GranolaPkmTargetRegistry = GranolaCapabilityRegistry<
  GranolaPkmTargetKind,
  GranolaPkmTargetDefinition
>;

function slug(value: string, fallback: string): string {
  return sanitiseFilename(value, fallback);
}

export function createGranolaPkmTargetRegistry(): GranolaPkmTargetRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaPkmTargetRegistry(): GranolaPkmTargetRegistry {
  return createGranolaPkmTargetRegistry()
    .register("docs-folder", {
      defaultNotesSubdir: "Meetings",
      defaultTranscriptsSubdir: "Transcripts",
      description:
        "A generic local markdown/docs directory target for reviewable meeting publishing.",
      kind: "docs-folder",
      label: "Docs folder",
      reviewMode: "recommended",
      supportsFolderSubdirectories: true,
      supportsFrontmatter: true,
      transport: "filesystem",
    })
    .register("obsidian", {
      defaultNotesSubdir: "Meetings",
      defaultTranscriptsSubdir: "Meeting Transcripts",
      description:
        "An Obsidian-friendly filesystem target with frontmatter and vault-specific publishing affordances.",
      kind: "obsidian",
      label: "Obsidian vault",
      reviewMode: "recommended",
      supportsDailyNotes: true,
      supportsFolderSubdirectories: true,
      supportsFrontmatter: true,
      supportsOpenInApp: true,
      transport: "filesystem",
    });
}

const defaultRegistry = createDefaultGranolaPkmTargetRegistry();

export function listGranolaPkmTargetDefinitions(): GranolaPkmTargetDefinition[] {
  return defaultRegistry.entries().map(([, definition]) => ({ ...definition }));
}

export function resolveGranolaPkmTargetDefinition(
  kind: GranolaPkmTargetKind,
): GranolaPkmTargetDefinition {
  return { ...defaultRegistry.resolve(kind, "PKM target") };
}

export function parseGranolaPkmTargetKind(value: unknown): GranolaPkmTargetKind | undefined {
  const kind = typeof value === "string" ? value.trim() : "";
  if (!kind) {
    return undefined;
  }

  return defaultRegistry.has(kind as GranolaPkmTargetKind)
    ? (kind as GranolaPkmTargetKind)
    : undefined;
}

export function defaultPkmTargetFrontmatterEnabled(kind: GranolaPkmTargetKind): boolean {
  return resolveGranolaPkmTargetDefinition(kind).supportsFrontmatter === true;
}

export function defaultPkmTargetReviewMode(kind: GranolaPkmTargetKind): GranolaPkmTargetReviewMode {
  return resolveGranolaPkmTargetDefinition(kind).reviewMode;
}

export function defaultPkmTargetNotesSubdir(kind: GranolaPkmTargetKind): string {
  return resolveGranolaPkmTargetDefinition(kind).defaultNotesSubdir;
}

export function defaultPkmTargetTranscriptsSubdir(kind: GranolaPkmTargetKind): string {
  return resolveGranolaPkmTargetDefinition(kind).defaultTranscriptsSubdir;
}

export function buildGranolaPkmPublishIdentity(
  input: GranolaPkmPublishIdentityInput,
): GranolaPkmPublishIdentity {
  const preferredStem = input.target.filenameTemplate?.trim()
    ? input.target.filenameTemplate
        .replaceAll("{{meeting.id}}", input.meetingId)
        .replaceAll("{{meeting.title}}", input.meetingTitle)
        .replaceAll("{{artefact.kind}}", input.artifactKind)
        .replaceAll("{{action.id}}", input.actionId ?? "")
    : `${input.meetingTitle}-${input.artifactKind}`;

  const safeStem = slug(preferredStem, `${input.meetingId}-${input.artifactKind}`);
  const actionPart = input.actionId?.trim() ? `:${input.actionId.trim()}` : "";

  return {
    fileName: `${safeStem}.md`,
    key: `${input.target.id}:${input.meetingId}:${input.artifactKind}${actionPart}`,
    preferredStem: safeStem,
  };
}
