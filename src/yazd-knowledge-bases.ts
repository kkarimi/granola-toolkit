import { dirname, extname, join, relative } from "node:path";

import type {
  GranolaAutomationArtefact,
  GranolaMeetingBundle,
  GranolaPkmPublishPreview,
  GranolaPkmTarget,
  GranolaYazdArtifact,
  GranolaYazdArtifactBundle,
  GranolaYazdKnowledgeBasePublishInput,
  GranolaYazdKnowledgeBasePublishPreview,
  GranolaYazdKnowledgeBasePublishResult,
  GranolaYazdKnowledgeBaseRef,
  GranolaYazdKnowledgeBaseKind,
  GranolaYazdPublishPlanEntry,
} from "./app/types.ts";
import { syncManagedExports } from "./export-state.ts";
import { buildObsidianOpenFileUri } from "./obsidian-uri.ts";
import {
  buildGranolaPkmPublishIdentity,
  defaultPkmTargetFrontmatterEnabled,
  defaultPkmTargetNotesSubdir,
  defaultPkmTargetTranscriptsSubdir,
  resolveObsidianTargetRuntime,
} from "./pkm-target-registry.ts";
import { asRecord, quoteYamlString, sanitiseFilename, stringValue } from "./utils.ts";
import { buildGranolaYazdAutomationArtifactBundle } from "./yazd-source.ts";

export interface GranolaYazdKnowledgeBasePlugin {
  description?: string;
  id: string;
  kinds: readonly GranolaYazdKnowledgeBaseKind[];
  label: string;
  previewPublish(
    input: GranolaYazdKnowledgeBasePublishInput,
  ): Promise<GranolaYazdKnowledgeBasePublishPreview>;
  publish(
    input: GranolaYazdKnowledgeBasePublishInput,
  ): Promise<GranolaYazdKnowledgeBasePublishResult>;
}

type MarkdownVaultLinkStyle = "markdown" | "obsidian";

interface GranolaYazdFolderMetadata {
  id?: string;
  name: string;
}

interface GranolaYazdKnowledgeBaseSettings {
  dailyNotesDir?: string;
  filenameTemplate?: string;
  folderSubdirectories?: boolean;
  frontmatter?: boolean;
  notesSubdir: string;
  transcriptsSubdir: string;
  vaultName?: string;
}

interface GranolaYazdKnowledgeBasePlanItem {
  artifactId: string;
  artifactKind: GranolaYazdPublishPlanEntry["artifactKind"];
  content: string;
  filePath: string;
  openUrl?: string;
  outputDir: string;
  preferredStem: string;
  relativeDir?: string;
  sourceUpdatedAt: string;
}

interface GranolaYazdKnowledgeBasePlan {
  dailyNote?: GranolaYazdKnowledgeBasePlanItem;
  entries: GranolaYazdPublishPlanEntry[];
  note: GranolaYazdKnowledgeBasePlanItem;
  transcript?: GranolaYazdKnowledgeBasePlanItem;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function knowledgeBaseSettings(
  knowledgeBase: GranolaYazdKnowledgeBaseRef,
): GranolaYazdKnowledgeBaseSettings {
  return {
    dailyNotesDir: knowledgeBase.settings?.dailyNotesDir?.trim() || undefined,
    filenameTemplate: knowledgeBase.settings?.filenameTemplate?.trim() || undefined,
    folderSubdirectories: knowledgeBase.settings?.folderSubdirectories === true,
    frontmatter:
      knowledgeBase.settings?.frontmatter ??
      defaultPkmTargetFrontmatterEnabled(
        knowledgeBase.kind === "obsidian-vault" ? "obsidian" : "docs-folder",
      ),
    notesSubdir:
      knowledgeBase.settings?.notesSubdir?.trim() ||
      defaultPkmTargetNotesSubdir(
        knowledgeBase.kind === "obsidian-vault" ? "obsidian" : "docs-folder",
      ),
    transcriptsSubdir:
      knowledgeBase.settings?.transcriptsSubdir?.trim() ||
      defaultPkmTargetTranscriptsSubdir(
        knowledgeBase.kind === "obsidian-vault" ? "obsidian" : "docs-folder",
      ),
    vaultName: knowledgeBase.settings?.vaultName?.trim() || undefined,
  };
}

function foldersFromBundle(bundle: GranolaYazdArtifactBundle): GranolaYazdFolderMetadata[] {
  const metadata = asRecord(bundle.metadata);
  const folders = metadata?.folders;
  if (!Array.isArray(folders)) {
    return [];
  }

  const result: GranolaYazdFolderMetadata[] = [];
  for (const folder of folders) {
    const record = asRecord(folder);
    if (!record) {
      continue;
    }

    const name = stringValue(record.name).trim();
    if (!name) {
      continue;
    }

    result.push({
      id: stringValue(record.id).trim() || undefined,
      name,
    });
  }

  return result;
}

function tagsFromBundle(bundle: GranolaYazdArtifactBundle): string[] {
  const metadata = asRecord(bundle.metadata);
  const metadataTags = metadata?.tags;
  if (Array.isArray(metadataTags)) {
    return uniqueStrings(metadataTags.map((tag) => (typeof tag === "string" ? tag : undefined)));
  }

  return uniqueStrings(bundle.tags ?? []);
}

function meetingDateFromBundle(bundle: GranolaYazdArtifactBundle): string {
  const metadata = asRecord(bundle.metadata);
  const value = stringValue(metadata?.meetingDate).trim();
  if (value) {
    return value;
  }

  return (bundle.updatedAt || new Date().toISOString()).slice(0, 10);
}

function meetingTitleFromBundle(bundle: GranolaYazdArtifactBundle): string {
  const metadata = asRecord(bundle.metadata);
  const value = stringValue(metadata?.meetingTitle).trim();
  return value || bundle.title || bundle.sourceItemId;
}

function linkStyleForKnowledgeBase(
  knowledgeBase: GranolaYazdKnowledgeBaseRef,
): MarkdownVaultLinkStyle {
  return knowledgeBase.kind === "obsidian-vault" ? "obsidian" : "markdown";
}

function resolveKnowledgeBaseRelativeDir(
  knowledgeBase: GranolaYazdKnowledgeBaseRef,
  kind: "notes" | "transcripts",
  folderName?: string,
): string {
  const settings = knowledgeBaseSettings(knowledgeBase);
  const baseDir = kind === "notes" ? settings.notesSubdir : settings.transcriptsSubdir;
  if (!settings.folderSubdirectories || !folderName?.trim()) {
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

function yamlListLines(key: string, values: string[]): string[] {
  return values.length > 0
    ? [`${key}:`, ...values.map((value) => `  - ${quoteYamlString(value)}`)]
    : [`${key}:`, "  []"];
}

function findFirstArtifact(
  bundle: GranolaYazdArtifactBundle,
  kind: GranolaYazdArtifact["kind"],
): GranolaYazdArtifact | undefined {
  return bundle.artifacts.find((artifact) => artifact.kind === kind);
}

function findArtifacts(
  bundle: GranolaYazdArtifactBundle,
  kind: GranolaYazdArtifact["kind"],
): GranolaYazdArtifact[] {
  return bundle.artifacts.filter((artifact) => artifact.kind === kind);
}

function actionItemMeta(artifact: GranolaYazdArtifact): {
  dueDate?: string;
  owner?: string;
  ownerEmail?: string;
} {
  const metadata = asRecord(artifact.metadata);
  return {
    dueDate: stringValue(metadata?.dueDate).trim() || undefined,
    owner: stringValue(metadata?.owner).trim() || undefined,
    ownerEmail: stringValue(metadata?.ownerEmail).trim() || undefined,
  };
}

function entityMeta(artifact: GranolaYazdArtifact): {
  type?: string;
} {
  const metadata = asRecord(artifact.metadata);
  return {
    type: stringValue(metadata?.type).trim() || undefined,
  };
}

function noteIdentityKind(note: GranolaYazdArtifact): string {
  const metadata = asRecord(note.metadata);
  const automationArtefactKind = stringValue(metadata?.automationArtefactKind).trim();
  return automationArtefactKind || note.kind;
}

function renderActionItem(artifact: GranolaYazdArtifact): string {
  const meta = actionItemMeta(artifact);
  const details = [meta.owner || meta.ownerEmail, meta.dueDate ? `due ${meta.dueDate}` : undefined]
    .filter(Boolean)
    .join(" · ");
  return details ? `- [ ] ${artifact.title} (${details})` : `- [ ] ${artifact.title}`;
}

function renderEntity(artifact: GranolaYazdArtifact): string {
  const type = entityMeta(artifact).type;
  return type ? `- ${artifact.title} (${type})` : `- ${artifact.title}`;
}

function frontmatterLines(options: {
  bundle: GranolaYazdArtifactBundle;
  folders: string[];
  knowledgeBase: GranolaYazdKnowledgeBaseRef;
  note: GranolaYazdArtifact;
  publishIdentityKey: string;
  tags: string[];
}): string[] {
  const settings = knowledgeBaseSettings(options.knowledgeBase);
  if (!settings.frontmatter) {
    return [];
  }

  return [
    "---",
    `title: ${quoteYamlString(options.note.title)}`,
    `meetingId: ${quoteYamlString(options.bundle.sourceItemId)}`,
    `sourcePluginId: ${quoteYamlString(options.bundle.sourcePluginId)}`,
    `sourceItemId: ${quoteYamlString(options.bundle.sourceItemId)}`,
    `artifactId: ${quoteYamlString(options.note.id)}`,
    `artifactKind: ${quoteYamlString(noteIdentityKind(options.note))}`,
    `reviewStatus: ${quoteYamlString(options.note.provenance.reviewStatus)}`,
    `publishIdentity: ${quoteYamlString(options.publishIdentityKey)}`,
    ...(options.note.provenance.actionId
      ? [`actionId: ${quoteYamlString(options.note.provenance.actionId)}`]
      : []),
    ...(options.note.provenance.ruleId
      ? [`ruleId: ${quoteYamlString(options.note.provenance.ruleId)}`]
      : []),
    ...(options.note.provenance.provider
      ? [`provider: ${quoteYamlString(options.note.provenance.provider)}`]
      : []),
    ...(options.note.provenance.model
      ? [`model: ${quoteYamlString(options.note.provenance.model)}`]
      : []),
    ...yamlListLines("tags", options.tags),
    ...yamlListLines("folders", options.folders),
    "---",
    "",
  ];
}

function transcriptFrontmatterLines(options: {
  bundle: GranolaYazdArtifactBundle;
  folders: string[];
  knowledgeBase: GranolaYazdKnowledgeBaseRef;
  publishIdentityKey: string;
  tags: string[];
  transcript: GranolaYazdArtifact;
}): string[] {
  const settings = knowledgeBaseSettings(options.knowledgeBase);
  if (!settings.frontmatter) {
    return [];
  }

  return [
    "---",
    `title: ${quoteYamlString(options.transcript.title)}`,
    `meetingId: ${quoteYamlString(options.bundle.sourceItemId)}`,
    `sourcePluginId: ${quoteYamlString(options.bundle.sourcePluginId)}`,
    `sourceItemId: ${quoteYamlString(options.bundle.sourceItemId)}`,
    'artifactKind: "transcript"',
    `reviewStatus: ${quoteYamlString(options.transcript.provenance.reviewStatus)}`,
    `publishIdentity: ${quoteYamlString(options.publishIdentityKey)}`,
    ...yamlListLines("tags", options.tags),
    ...yamlListLines("folders", options.folders),
    "---",
    "",
  ];
}

function renderKnowledgeBaseNote(options: {
  bundle: GranolaYazdArtifactBundle;
  folders: string[];
  knowledgeBase: GranolaYazdKnowledgeBaseRef;
  note: GranolaYazdArtifact;
  noteFilePath: string;
  publishIdentityKey: string;
  rootDir: string;
  tags: string[];
  transcript?: GranolaYazdArtifact;
  transcriptFilePath?: string;
}): string {
  const transcriptLink =
    options.transcript && options.transcriptFilePath
      ? renderLink(
          linkStyleForKnowledgeBase(options.knowledgeBase),
          options.rootDir,
          options.noteFilePath,
          options.transcriptFilePath,
          "Transcript",
        )
      : undefined;
  const lines = frontmatterLines({
    bundle: options.bundle,
    folders: options.folders,
    knowledgeBase: options.knowledgeBase,
    note: options.note,
    publishIdentityKey: options.publishIdentityKey,
    tags: options.tags,
  });

  if (transcriptLink) {
    lines.push("## Related", "", `- Transcript: ${transcriptLink}`, "");
  }

  const markdown = options.note.markdown?.trim() || options.note.text?.trim() || "";
  if (markdown) {
    lines.push(markdown, "");
  }

  const decisions = findArtifacts(options.bundle, "decision");
  if (decisions.length > 0) {
    lines.push("## Decisions", "", ...decisions.map((decision) => `- ${decision.title}`), "");
  }

  const actionItems = findArtifacts(options.bundle, "action-item");
  if (actionItems.length > 0) {
    lines.push("## Action items", "", ...actionItems.map(renderActionItem), "");
  }

  const entities = findArtifacts(options.bundle, "entity");
  if (entities.length > 0) {
    lines.push("## Entities", "", ...entities.map(renderEntity), "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderKnowledgeBaseTranscript(options: {
  bundle: GranolaYazdArtifactBundle;
  folders: string[];
  knowledgeBase: GranolaYazdKnowledgeBaseRef;
  note: GranolaYazdArtifact;
  noteFilePath: string;
  publishIdentityKey: string;
  rootDir: string;
  tags: string[];
  transcript: GranolaYazdArtifact;
  transcriptFilePath: string;
}): string {
  const noteLink = renderLink(
    linkStyleForKnowledgeBase(options.knowledgeBase),
    options.rootDir,
    options.transcriptFilePath,
    options.noteFilePath,
    options.note.title || options.bundle.title,
  );
  const lines = transcriptFrontmatterLines({
    bundle: options.bundle,
    folders: options.folders,
    knowledgeBase: options.knowledgeBase,
    publishIdentityKey: options.publishIdentityKey,
    tags: options.tags,
    transcript: options.transcript,
  });

  lines.push(
    "## Related",
    "",
    `- Note: ${noteLink}`,
    "",
    "## Transcript",
    "",
    options.transcript.markdown?.trim() ||
      options.transcript.text?.trim() ||
      "(Transcript unavailable)",
  );

  return `${lines.join("\n").trimEnd()}\n`;
}

function buildKnowledgeBasePlan(
  input: GranolaYazdKnowledgeBasePublishInput,
): GranolaYazdKnowledgeBasePlan {
  const note = findFirstArtifact(input.bundle, "note");
  if (!note) {
    throw new Error("knowledge base publish requires a note artifact");
  }

  const transcript = findFirstArtifact(input.bundle, "transcript");
  const folders = foldersFromBundle(input.bundle);
  const folderName = folders[0]?.name;
  const folderNames = uniqueStrings(folders.map((folder) => folder.name));
  const tags = tagsFromBundle(input.bundle);
  const noteRelativeDir = resolveKnowledgeBaseRelativeDir(input.knowledgeBase, "notes", folderName);
  const transcriptRelativeDir = resolveKnowledgeBaseRelativeDir(
    input.knowledgeBase,
    "transcripts",
    folderName,
  );

  const noteIdentity = buildGranolaPkmPublishIdentity({
    actionId: note.provenance.actionId,
    artifactKind: noteIdentityKind(note),
    meetingId: input.bundle.sourceItemId,
    meetingTitle: meetingTitleFromBundle(input.bundle),
    target: {
      filenameTemplate: knowledgeBaseSettings(input.knowledgeBase).filenameTemplate,
      id: input.knowledgeBase.id,
    },
  });
  const noteFilePath = join(input.knowledgeBase.rootDir, noteRelativeDir, noteIdentity.fileName);

  const transcriptIdentity = transcript
    ? buildGranolaPkmPublishIdentity({
        artifactKind: "transcript",
        meetingId: input.bundle.sourceItemId,
        meetingTitle: meetingTitleFromBundle(input.bundle),
        target: {
          id: input.knowledgeBase.id,
        },
      })
    : undefined;
  const transcriptFilePath =
    transcript && transcriptIdentity
      ? join(
          input.knowledgeBase.rootDir,
          transcriptRelativeDir,
          `${transcriptIdentity.preferredStem}.md`,
        )
      : undefined;

  const obsidianRuntime =
    input.knowledgeBase.kind === "obsidian-vault"
      ? resolveObsidianTargetRuntime({
          dailyNotesDir: knowledgeBaseSettings(input.knowledgeBase).dailyNotesDir,
          name: input.knowledgeBase.label,
          outputDir: input.knowledgeBase.rootDir,
          vaultName: knowledgeBaseSettings(input.knowledgeBase).vaultName,
        })
      : undefined;
  const dailyNotesDir = obsidianRuntime?.dailyNotesDir;
  const dailyNoteFilePath = dailyNotesDir
    ? join(input.knowledgeBase.rootDir, dailyNotesDir, `${meetingDateFromBundle(input.bundle)}.md`)
    : undefined;

  const noteOpenUrl =
    input.knowledgeBase.kind === "obsidian-vault"
      ? buildObsidianOpenFileUri({
          filePath: relative(input.knowledgeBase.rootDir, noteFilePath),
          target: {
            outputDir: input.knowledgeBase.rootDir,
            vaultName: obsidianRuntime?.vaultName,
          },
        })
      : undefined;
  const transcriptOpenUrl =
    input.knowledgeBase.kind === "obsidian-vault" && transcriptFilePath
      ? buildObsidianOpenFileUri({
          filePath: relative(input.knowledgeBase.rootDir, transcriptFilePath),
          target: {
            outputDir: input.knowledgeBase.rootDir,
            vaultName: obsidianRuntime?.vaultName,
          },
        })
      : undefined;
  const dailyNoteOpenUrl =
    input.knowledgeBase.kind === "obsidian-vault" && dailyNoteFilePath
      ? buildObsidianOpenFileUri({
          filePath: relative(input.knowledgeBase.rootDir, dailyNoteFilePath),
          target: {
            outputDir: input.knowledgeBase.rootDir,
            vaultName: obsidianRuntime?.vaultName,
          },
        })
      : undefined;

  const planNote: GranolaYazdKnowledgeBasePlanItem = {
    artifactId: note.id,
    artifactKind: "note",
    content: renderKnowledgeBaseNote({
      bundle: input.bundle,
      folders: folderNames,
      knowledgeBase: input.knowledgeBase,
      note,
      noteFilePath,
      publishIdentityKey: noteIdentity.key,
      rootDir: input.knowledgeBase.rootDir,
      tags,
      transcript,
      transcriptFilePath,
    }),
    filePath: noteFilePath,
    openUrl: noteOpenUrl,
    outputDir: input.knowledgeBase.rootDir,
    preferredStem: noteIdentity.preferredStem,
    relativeDir: noteRelativeDir,
    sourceUpdatedAt:
      note.provenance.sourceUpdatedAt ?? input.bundle.updatedAt ?? new Date().toISOString(),
  };

  const planTranscript =
    transcript && transcriptFilePath && transcriptIdentity
      ? ({
          artifactId: transcript.id,
          artifactKind: "transcript" as const,
          content: renderKnowledgeBaseTranscript({
            bundle: input.bundle,
            folders: folderNames,
            knowledgeBase: input.knowledgeBase,
            note,
            noteFilePath,
            publishIdentityKey: transcriptIdentity.key,
            rootDir: input.knowledgeBase.rootDir,
            tags,
            transcript,
            transcriptFilePath,
          }),
          filePath: transcriptFilePath,
          openUrl: transcriptOpenUrl,
          outputDir: input.knowledgeBase.rootDir,
          preferredStem: transcriptIdentity.preferredStem,
          relativeDir: transcriptRelativeDir,
          sourceUpdatedAt:
            transcript.provenance.sourceUpdatedAt ??
            input.bundle.updatedAt ??
            new Date().toISOString(),
        } satisfies GranolaYazdKnowledgeBasePlanItem)
      : undefined;

  const planDailyNote =
    dailyNoteFilePath && dailyNotesDir
      ? ({
          artifactId: `daily-note:${input.knowledgeBase.id}:${meetingDateFromBundle(input.bundle)}`,
          artifactKind: "daily-note" as const,
          content: [
            ...(knowledgeBaseSettings(input.knowledgeBase).frontmatter
              ? [
                  "---",
                  `title: ${quoteYamlString(meetingDateFromBundle(input.bundle))}`,
                  'type: "daily-note"',
                  `date: ${quoteYamlString(meetingDateFromBundle(input.bundle))}`,
                  "---",
                  "",
                ]
              : []),
            "## Meetings",
            "",
            transcriptFilePath
              ? `- ${renderLink("obsidian", input.knowledgeBase.rootDir, dailyNoteFilePath, noteFilePath, input.bundle.title || input.bundle.sourceItemId)} · ${renderLink("obsidian", input.knowledgeBase.rootDir, dailyNoteFilePath, transcriptFilePath, `${input.bundle.title || input.bundle.sourceItemId} Transcript`)}`
              : `- ${renderLink("obsidian", input.knowledgeBase.rootDir, dailyNoteFilePath, noteFilePath, input.bundle.title || input.bundle.sourceItemId)}`,
          ].join("\n"),
          filePath: dailyNoteFilePath,
          openUrl: dailyNoteOpenUrl,
          outputDir: join(input.knowledgeBase.rootDir, dailyNotesDir),
          preferredStem: meetingDateFromBundle(input.bundle),
          sourceUpdatedAt: input.bundle.updatedAt ?? new Date().toISOString(),
        } satisfies GranolaYazdKnowledgeBasePlanItem)
      : undefined;

  const entries: GranolaYazdPublishPlanEntry[] = [
    {
      action: "write",
      artifactId: planNote.artifactId,
      artifactKind: planNote.artifactKind,
      openUrl: planNote.openUrl,
      path: planNote.filePath,
      reason: "Primary note",
    },
    ...(planTranscript
      ? [
          {
            action: "write" as const,
            artifactId: planTranscript.artifactId,
            artifactKind: planTranscript.artifactKind,
            openUrl: planTranscript.openUrl,
            path: planTranscript.filePath,
            reason: "Transcript companion",
          },
        ]
      : []),
    ...(planDailyNote
      ? [
          {
            action: "update" as const,
            artifactId: planDailyNote.artifactId,
            artifactKind: planDailyNote.artifactKind,
            openUrl: planDailyNote.openUrl,
            path: planDailyNote.filePath,
            reason: "Daily note backlink",
          },
        ]
      : []),
  ];

  return {
    dailyNote: planDailyNote,
    entries,
    note: planNote,
    transcript: planTranscript,
  };
}

const granMarkdownVaultKnowledgeBasePlugin: GranolaYazdKnowledgeBasePlugin = {
  description: "Publish Gran/Yazd artifacts into a local markdown folder or Obsidian vault.",
  id: "gran-markdown-vault",
  kinds: ["folder", "obsidian-vault"],
  label: "Markdown vault",
  async previewPublish(input) {
    const plan = buildKnowledgeBasePlan(input);
    return {
      ...input.knowledgeBase,
      entries: plan.entries.map((entry) => ({ ...entry })),
    };
  },
  async publish(input) {
    const plan = buildKnowledgeBasePlan(input);
    let writtenCount = await syncManagedExports({
      items: [
        {
          content: plan.note.content,
          extension: ".md",
          id: plan.note.artifactId,
          preferredStem: plan.note.preferredStem,
          relativeDir: plan.note.relativeDir,
          sourceUpdatedAt: plan.note.sourceUpdatedAt,
        },
      ],
      kind: "notes",
      outputDir: plan.note.outputDir,
    });

    if (plan.transcript) {
      writtenCount += await syncManagedExports({
        items: [
          {
            content: plan.transcript.content,
            extension: ".md",
            id: plan.transcript.artifactId,
            preferredStem: plan.transcript.preferredStem,
            relativeDir: plan.transcript.relativeDir,
            sourceUpdatedAt: plan.transcript.sourceUpdatedAt,
          },
        ],
        kind: "transcripts",
        outputDir: plan.transcript.outputDir,
      });
    }

    if (plan.dailyNote) {
      writtenCount += await syncManagedExports({
        items: [
          {
            content: plan.dailyNote.content,
            extension: ".md",
            id: plan.dailyNote.artifactId,
            preferredStem: plan.dailyNote.preferredStem,
            sourceUpdatedAt: plan.dailyNote.sourceUpdatedAt,
          },
        ],
        kind: "notes",
        outputDir: plan.dailyNote.outputDir,
      });
    }

    return {
      ...input.knowledgeBase,
      entries: plan.entries.map((entry) => ({ ...entry })),
      publishedAt: new Date().toISOString(),
      writtenCount,
    };
  },
};

export function buildGranolaYazdKnowledgeBaseRef(
  target: GranolaPkmTarget,
): GranolaYazdKnowledgeBaseRef {
  return {
    id: target.id,
    kind: target.kind === "obsidian" ? "obsidian-vault" : "folder",
    label: target.name,
    rootDir: target.outputDir,
    settings: {
      dailyNotesDir: target.dailyNotesDir?.trim() || undefined,
      filenameTemplate: target.filenameTemplate?.trim() || undefined,
      folderSubdirectories: target.folderSubdirectories,
      frontmatter: target.frontmatter,
      notesSubdir: target.notesSubdir?.trim() || undefined,
      transcriptsSubdir: target.transcriptsSubdir?.trim() || undefined,
      vaultName: target.vaultName?.trim() || undefined,
    },
  };
}

export function resolveGranolaYazdKnowledgeBasePlugin(
  knowledgeBase: Pick<GranolaYazdKnowledgeBaseRef, "kind">,
): GranolaYazdKnowledgeBasePlugin {
  if (granMarkdownVaultKnowledgeBasePlugin.kinds.includes(knowledgeBase.kind)) {
    return granMarkdownVaultKnowledgeBasePlugin;
  }

  throw new Error(`no Yazd knowledge-base plugin registered for ${knowledgeBase.kind}`);
}

export function listGranolaYazdKnowledgeBasePlugins(): GranolaYazdKnowledgeBasePlugin[] {
  return [
    {
      ...granMarkdownVaultKnowledgeBasePlugin,
      kinds: [...granMarkdownVaultKnowledgeBasePlugin.kinds],
    },
  ];
}

export function previewGranolaYazdKnowledgeBasePublishSync(
  input: GranolaYazdKnowledgeBasePublishInput,
): GranolaYazdKnowledgeBasePublishPreview {
  const plugin = resolveGranolaYazdKnowledgeBasePlugin(input.knowledgeBase);
  if (plugin.id !== granMarkdownVaultKnowledgeBasePlugin.id) {
    throw new Error(`knowledge-base plugin ${plugin.id} requires async preview`);
  }

  const plan = buildKnowledgeBasePlan(input);
  return {
    ...input.knowledgeBase,
    entries: plan.entries.map((entry) => ({ ...entry })),
  };
}

export async function previewGranolaYazdKnowledgeBasePublish(
  input: GranolaYazdKnowledgeBasePublishInput,
): Promise<GranolaYazdKnowledgeBasePublishPreview> {
  return previewGranolaYazdKnowledgeBasePublishSync(input);
}

export async function publishGranolaYazdKnowledgeBase(
  input: GranolaYazdKnowledgeBasePublishInput,
): Promise<GranolaYazdKnowledgeBasePublishResult> {
  return await resolveGranolaYazdKnowledgeBasePlugin(input.knowledgeBase).publish(input);
}

export function buildGranolaAutomationKnowledgeBaseBundle(options: {
  artefact: GranolaAutomationArtefact;
  bundle: GranolaMeetingBundle;
}): GranolaYazdArtifactBundle {
  return buildGranolaYazdAutomationArtifactBundle(options);
}

export function legacyPkmPreviewFromYazdKnowledgeBasePreview(
  preview: GranolaYazdKnowledgeBasePublishPreview,
): GranolaPkmPublishPreview {
  const noteEntry = preview.entries.find((entry) => entry.artifactKind === "note");
  if (!noteEntry) {
    throw new Error("knowledge base preview is missing a note entry");
  }

  const transcriptEntry = preview.entries.find((entry) => entry.artifactKind === "transcript");
  const dailyNoteEntry = preview.entries.find((entry) => entry.artifactKind === "daily-note");

  return {
    dailyNoteFilePath: dailyNoteEntry?.path,
    dailyNoteOpenUrl: dailyNoteEntry?.openUrl,
    noteFilePath: noteEntry.path,
    noteOpenUrl: noteEntry.openUrl,
    transcriptFilePath: transcriptEntry?.path,
    transcriptOpenUrl: transcriptEntry?.openUrl,
  };
}

export function legacyPkmSyncResultFromYazdKnowledgeBasePublishResult(
  result: GranolaYazdKnowledgeBasePublishResult,
): {
  dailyNoteFilePath?: string;
  dailyNoteOpenUrl?: string;
  filePath: string;
  noteOpenUrl?: string;
  transcriptFilePath?: string;
  transcriptOpenUrl?: string;
  written: number;
} {
  const preview = legacyPkmPreviewFromYazdKnowledgeBasePreview(result);
  return {
    dailyNoteFilePath: preview.dailyNoteFilePath,
    dailyNoteOpenUrl: preview.dailyNoteOpenUrl,
    filePath: preview.noteFilePath,
    noteOpenUrl: preview.noteOpenUrl,
    transcriptFilePath: preview.transcriptFilePath,
    transcriptOpenUrl: preview.transcriptOpenUrl,
    written: result.writtenCount,
  };
}
