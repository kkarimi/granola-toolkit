import { dirname, extname, join, relative } from "node:path";

import type {
  GranolaAutomationArtefact,
  GranolaAutomationMatch,
  GranolaMeetingBundle,
  GranolaPkmTarget,
} from "./app/index.ts";
import { syncManagedExports } from "./export-state.ts";
import {
  buildPkmAutomationArtefactProjection,
  buildPkmMeetingContextFromDocument,
  buildPkmTranscriptArtifact,
} from "./pkm-artifacts.ts";
import {
  buildGranolaPkmPublishIdentity,
  defaultPkmTargetFrontmatterEnabled,
  defaultPkmTargetNotesSubdir,
  defaultPkmTargetTranscriptsSubdir,
} from "./pkm-target-registry.ts";
import { latestDocumentTimestamp, quoteYamlString, sanitiseFilename } from "./utils.ts";

type MarkdownVaultLinkStyle = "markdown" | "obsidian";

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function linkStyleForTarget(target: GranolaPkmTarget): MarkdownVaultLinkStyle {
  return target.kind === "obsidian" ? "obsidian" : "markdown";
}

function pkmTargetFrontmatterEnabled(target: GranolaPkmTarget): boolean {
  return target.frontmatter ?? defaultPkmTargetFrontmatterEnabled(target.kind);
}

export function resolvePkmTargetSubdir(
  target: GranolaPkmTarget,
  kind: "notes" | "transcripts",
): string {
  if (kind === "notes") {
    return target.notesSubdir?.trim() || defaultPkmTargetNotesSubdir(target.kind);
  }

  return target.transcriptsSubdir?.trim() || defaultPkmTargetTranscriptsSubdir(target.kind);
}

function resolvePkmTargetRelativeDir(
  target: GranolaPkmTarget,
  kind: "notes" | "transcripts",
  folderName?: string,
): string {
  const baseDir = resolvePkmTargetSubdir(target, kind);
  if (!target.folderSubdirectories || !folderName?.trim()) {
    return baseDir;
  }

  return join(baseDir, sanitiseFilename(folderName, "folder"));
}

function obsidianLinkForPath(pathname: string): string {
  const withoutExtension = pathname.replace(extname(pathname), "");
  return `[[${withoutExtension.replaceAll("\\", "/")}]]`;
}

function markdownLinkForPath(fromPath: string, toPath: string, label: string): string {
  const linkPath = relative(dirname(fromPath), toPath).replaceAll("\\", "/");
  return `[${label}](${linkPath})`;
}

function renderLink(
  style: MarkdownVaultLinkStyle,
  rootDir: string,
  fromPath: string,
  toPath: string,
  label: string,
): string {
  if (style === "obsidian") {
    return obsidianLinkForPath(relative(rootDir, toPath));
  }

  return markdownLinkForPath(fromPath, toPath, label);
}

function pkmFrontmatterLines(options: {
  artefact: Pick<
    GranolaAutomationArtefact,
    "actionId" | "id" | "kind" | "model" | "provider" | "ruleId" | "structured"
  >;
  folders: string[];
  meetingId: string;
  publishIdentityKey: string;
  reviewStatus: string;
  tags: string[];
  target: GranolaPkmTarget;
}): string[] {
  if (!pkmTargetFrontmatterEnabled(options.target)) {
    return [];
  }

  return [
    "---",
    `title: ${quoteYamlString(options.artefact.structured.title)}`,
    `meetingId: ${quoteYamlString(options.meetingId)}`,
    `artefactId: ${quoteYamlString(options.artefact.id)}`,
    `artefactKind: ${quoteYamlString(options.artefact.kind)}`,
    `reviewStatus: ${quoteYamlString(options.reviewStatus)}`,
    `publishIdentity: ${quoteYamlString(options.publishIdentityKey)}`,
    `ruleId: ${quoteYamlString(options.artefact.ruleId)}`,
    `sourceActionId: ${quoteYamlString(options.artefact.actionId)}`,
    `provider: ${quoteYamlString(options.artefact.provider)}`,
    `model: ${quoteYamlString(options.artefact.model)}`,
    ...yamlListLines("tags", options.tags),
    ...yamlListLines("folders", options.folders),
    "---",
    "",
  ];
}

function transcriptFrontmatterLines(options: {
  folders: string[];
  meetingId: string;
  publishIdentityKey: string;
  sourceId: string;
  sourceUpdatedAt: string;
  tags: string[];
  target: GranolaPkmTarget;
  title: string;
}): string[] {
  if (!pkmTargetFrontmatterEnabled(options.target)) {
    return [];
  }

  return [
    "---",
    `title: ${quoteYamlString(options.title)}`,
    `meetingId: ${quoteYamlString(options.meetingId)}`,
    'artefactKind: "transcript"',
    'reviewStatus: "not-required"',
    `publishIdentity: ${quoteYamlString(options.publishIdentityKey)}`,
    `sourceId: ${quoteYamlString(options.sourceId)}`,
    `sourceUpdatedAt: ${quoteYamlString(options.sourceUpdatedAt)}`,
    ...yamlListLines("tags", options.tags),
    ...yamlListLines("folders", options.folders),
    "---",
    "",
  ];
}

function renderActionItem(item: {
  dueDate?: string;
  owner?: string;
  ownerEmail?: string;
  title: string;
}): string {
  const meta = [
    item.owner?.trim() || item.ownerEmail?.trim() || undefined,
    item.dueDate?.trim() ? `due ${item.dueDate.trim()}` : undefined,
  ].filter(Boolean);
  return meta.length > 0 ? `- [ ] ${item.title} (${meta.join(" · ")})` : `- [ ] ${item.title}`;
}

function renderEntity(entity: { label: string; type: string }): string {
  return `- ${entity.label} (${entity.type})`;
}

function yamlListLines(key: string, values: string[]): string[] {
  return values.length > 0
    ? [`${key}:`, ...values.map((value) => `  - ${quoteYamlString(value)}`)]
    : [`${key}:`, "  []"];
}

function renderMarkdownVaultNote(options: {
  artefact: GranolaAutomationArtefact;
  folderNames: string[];
  meetingId: string;
  noteFilePath: string;
  publishIdentityKey: string;
  rootDir: string;
  tags: string[];
  target: GranolaPkmTarget;
  transcriptFilePath?: string;
}): string {
  const projection = buildPkmAutomationArtefactProjection(options.artefact);
  const transcriptLink = options.transcriptFilePath
    ? renderLink(
        linkStyleForTarget(options.target),
        options.rootDir,
        options.noteFilePath,
        options.transcriptFilePath,
        "Transcript",
      )
    : undefined;
  const lines = pkmFrontmatterLines({
    artefact: options.artefact,
    folders: options.folderNames,
    meetingId: options.meetingId,
    publishIdentityKey: options.publishIdentityKey,
    reviewStatus: projection.provenance.reviewStatus,
    tags: options.tags,
    target: options.target,
  });

  if (transcriptLink) {
    lines.push("## Related", "", `- Transcript: ${transcriptLink}`, "");
  }

  const markdown = options.artefact.structured.markdown.trim();
  if (markdown) {
    lines.push(markdown, "");
  } else if (options.artefact.structured.summary?.trim()) {
    lines.push(options.artefact.structured.summary.trim(), "");
  }

  if (projection.decisions.length > 0) {
    lines.push(
      "## Decisions",
      "",
      ...projection.decisions.map((decision) => `- ${decision.text}`),
      "",
    );
  }

  if (projection.actionItems.length > 0) {
    lines.push(
      "## Action items",
      "",
      ...projection.actionItems.map((item) => renderActionItem(item)),
      "",
    );
  }

  if (projection.entities.length > 0) {
    lines.push("## Entities", "", ...projection.entities.map((entity) => renderEntity(entity)), "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderMarkdownVaultTranscript(options: {
  bundle: GranolaMeetingBundle;
  folderNames: string[];
  meetingId: string;
  noteFilePath: string;
  publishIdentityKey: string;
  rootDir: string;
  tags: string[];
  target: GranolaPkmTarget;
  transcriptFilePath: string;
}): string {
  const meeting = buildPkmMeetingContextFromDocument(options.bundle.source.document);
  const transcript = buildPkmTranscriptArtifact(meeting, options.bundle.meeting.transcript!);
  const noteLink = renderLink(
    linkStyleForTarget(options.target),
    options.rootDir,
    options.transcriptFilePath,
    options.noteFilePath,
    options.bundle.meeting.meeting.title || options.meetingId,
  );
  const lines = transcriptFrontmatterLines({
    folders: options.folderNames,
    meetingId: options.meetingId,
    publishIdentityKey: options.publishIdentityKey,
    sourceId: transcript.provenance.sourceId,
    sourceUpdatedAt: transcript.provenance.sourceUpdatedAt ?? transcript.updatedAt,
    tags: options.tags,
    target: options.target,
    title: `${transcript.title || options.meetingId} Transcript`,
  });

  lines.push("## Related", "", `- Note: ${noteLink}`, "", "## Transcript", "", transcript.markdown);
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function syncMarkdownVaultTarget(options: {
  artefact: GranolaAutomationArtefact;
  bundle: GranolaMeetingBundle;
  match: GranolaAutomationMatch;
  target: GranolaPkmTarget;
}): Promise<{
  filePath: string;
  transcriptFilePath?: string;
  written: number;
}> {
  const meeting = buildPkmMeetingContextFromDocument(options.bundle.source.document);
  const folderName = meeting.folders[0]?.name || options.match.folders[0]?.name;
  const folderNames = uniqueStrings([
    ...meeting.folders.map((folder) => folder.name),
    ...options.match.folders.map((folder) => folder.name),
  ]);
  const tags = uniqueStrings([...meeting.tags, ...options.match.tags]);
  const noteRelativeDir = resolvePkmTargetRelativeDir(options.target, "notes", folderName);
  const transcriptRelativeDir = resolvePkmTargetRelativeDir(
    options.target,
    "transcripts",
    folderName,
  );

  const noteIdentity = buildGranolaPkmPublishIdentity({
    actionId: options.artefact.actionId,
    artifactKind: options.artefact.kind,
    meetingId: meeting.id,
    meetingTitle: options.match.title || meeting.title || options.artefact.structured.title,
    target: options.target,
  });
  const transcriptIdentity = buildGranolaPkmPublishIdentity({
    artifactKind: "transcript",
    meetingId: meeting.id,
    meetingTitle: meeting.title || options.match.title || meeting.id,
    target: {
      id: options.target.id,
    },
  });

  const noteFilePath = join(options.target.outputDir, noteRelativeDir, noteIdentity.fileName);
  const transcriptFilePath = options.bundle.meeting.transcript
    ? join(
        options.target.outputDir,
        transcriptRelativeDir,
        `${transcriptIdentity.preferredStem}.md`,
      )
    : undefined;

  let written = await syncManagedExports({
    items: [
      {
        content: renderMarkdownVaultNote({
          artefact: options.artefact,
          folderNames,
          meetingId: meeting.id,
          noteFilePath,
          publishIdentityKey: noteIdentity.key,
          rootDir: options.target.outputDir,
          tags,
          target: options.target,
          transcriptFilePath,
        }),
        extension: ".md",
        id: noteIdentity.key,
        preferredStem: noteIdentity.preferredStem,
        relativeDir: noteRelativeDir,
        sourceUpdatedAt: options.artefact.updatedAt,
      },
    ],
    kind: "notes",
    outputDir: options.target.outputDir,
  });

  if (options.bundle.meeting.transcript && transcriptFilePath) {
    written += await syncManagedExports({
      items: [
        {
          content: renderMarkdownVaultTranscript({
            bundle: options.bundle,
            folderNames,
            meetingId: meeting.id,
            noteFilePath,
            publishIdentityKey: transcriptIdentity.key,
            rootDir: options.target.outputDir,
            tags,
            target: options.target,
            transcriptFilePath,
          }),
          extension: ".md",
          id: transcriptIdentity.key,
          preferredStem: transcriptIdentity.preferredStem,
          relativeDir: transcriptRelativeDir,
          sourceUpdatedAt: latestDocumentTimestamp(options.bundle.source.document),
        },
      ],
      kind: "transcripts",
      outputDir: options.target.outputDir,
    });
  }

  return {
    filePath: noteFilePath,
    transcriptFilePath,
    written,
  };
}
