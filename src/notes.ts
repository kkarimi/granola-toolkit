import type { NoteExportRecord, NoteOutputFormat } from "./app/models.ts";
import { syncManagedExports } from "./export-state.ts";
import { toJson, toYaml } from "./render.ts";
import type { GranolaDocument, NoteContentSource } from "./types.ts";
import { convertProseMirrorToMarkdown } from "./prosemirror.ts";
import {
  compareStrings,
  htmlToMarkdown,
  latestDocumentTimestamp,
  quoteYamlString,
  sanitiseFilename,
} from "./utils.ts";

function selectNoteContent(document: GranolaDocument): {
  content: string;
  source: NoteContentSource;
} {
  const notes = convertProseMirrorToMarkdown(document.notes).trim();
  if (notes) {
    return { content: notes, source: "notes" };
  }

  const lastViewedPanel = convertProseMirrorToMarkdown(document.lastViewedPanel?.content).trim();
  if (lastViewedPanel) {
    return { content: lastViewedPanel, source: "lastViewedPanel.content" };
  }

  const originalContent = htmlToMarkdown(document.lastViewedPanel?.originalContent ?? "").trim();
  if (originalContent) {
    return { content: originalContent, source: "lastViewedPanel.originalContent" };
  }

  return { content: document.content.trim(), source: "content" };
}

export function buildNoteExport(document: GranolaDocument): NoteExportRecord {
  const { content, source } = selectNoteContent(document);
  return {
    content,
    contentSource: source,
    createdAt: document.createdAt,
    id: document.id,
    raw: document,
    tags: document.tags,
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

export function renderNoteExport(
  note: NoteExportRecord,
  format: NoteOutputFormat = "markdown",
): string {
  switch (format) {
    case "json":
      return toJson({
        content: note.content,
        contentSource: note.contentSource,
        createdAt: note.createdAt,
        id: note.id,
        tags: note.tags,
        title: note.title,
        updatedAt: note.updatedAt,
      });
    case "raw":
      return toJson(note.raw);
    case "yaml":
      return toYaml({
        content: note.content,
        contentSource: note.contentSource,
        createdAt: note.createdAt,
        id: note.id,
        tags: note.tags,
        title: note.title,
        updatedAt: note.updatedAt,
      });
    case "markdown":
      break;
  }

  const lines: string[] = [
    "---",
    `id: ${quoteYamlString(note.id)}`,
    `created: ${quoteYamlString(note.createdAt)}`,
    `updated: ${quoteYamlString(note.updatedAt)}`,
  ];

  if (note.tags.length > 0) {
    lines.push("tags:");
    for (const tag of note.tags) {
      lines.push(`  - ${quoteYamlString(tag)}`);
    }
  }

  lines.push("---", "");

  if (note.title.trim()) {
    lines.push(`# ${note.title.trim()}`, "");
  }

  if (note.content) {
    lines.push(note.content);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function documentToMarkdown(document: GranolaDocument): string {
  return renderNoteExport(buildNoteExport(document), "markdown");
}

function documentFilename(document: GranolaDocument): string {
  return sanitiseFilename(document.title || document.id, "untitled");
}

export function noteFileStem(document: GranolaDocument): string {
  return documentFilename(document);
}

function noteFileExtension(format: NoteOutputFormat): string {
  switch (format) {
    case "json":
      return ".json";
    case "raw":
      return ".raw.json";
    case "yaml":
      return ".yaml";
    case "markdown":
      return ".md";
  }
}

export async function writeNotes(
  documents: GranolaDocument[],
  outputDir: string,
  format: NoteOutputFormat = "markdown",
  options: {
    onProgress?: (progress: {
      completed: number;
      total: number;
      written: number;
    }) => Promise<void> | void;
    renderMarkdown?: (note: NoteExportRecord, document: GranolaDocument) => string;
  } = {},
): Promise<number> {
  const sorted = [...documents].sort(
    (left, right) =>
      compareStrings(left.title || left.id, right.title || right.id) ||
      compareStrings(left.id, right.id),
  );

  return await syncManagedExports({
    items: sorted.map((document) => {
      const note = buildNoteExport(document);
      const content =
        format === "markdown" && options.renderMarkdown
          ? options.renderMarkdown(note, document)
          : renderNoteExport(note, format);

      return {
        content,
        extension: noteFileExtension(format),
        id: note.id,
        preferredStem: noteFileStem(document),
        sourceUpdatedAt: latestDocumentTimestamp(document),
      };
    }),
    kind: "notes",
    onProgress: options.onProgress,
    outputDir,
  });
}
