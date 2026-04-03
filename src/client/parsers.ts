import type { GranolaDocument, LastViewedPanel, ProseMirrorDoc } from "../types.ts";
import { asRecord, parseJsonString, stringArray, stringValue } from "../utils.ts";

function parseProseMirrorDoc(
  value: unknown,
  options: { skipHtmlStrings?: boolean } = {},
): ProseMirrorDoc | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    if (options.skipHtmlStrings && trimmed.startsWith("<")) {
      return undefined;
    }

    const parsed = parseJsonString<unknown>(trimmed);
    if (!parsed) {
      return undefined;
    }

    return parseProseMirrorDoc(parsed, options);
  }

  const record = asRecord(value);
  if (!record || record.type !== "doc") {
    return undefined;
  }

  return record as unknown as ProseMirrorDoc;
}

function parseLastViewedPanel(value: unknown): LastViewedPanel | undefined {
  const panel = asRecord(value);
  if (!panel) {
    return undefined;
  }

  return {
    affinityNoteId: stringValue(panel.affinity_note_id),
    content: parseProseMirrorDoc(panel.content, { skipHtmlStrings: true }),
    contentUpdatedAt: stringValue(panel.content_updated_at),
    createdAt: stringValue(panel.created_at),
    deletedAt: stringValue(panel.deleted_at),
    documentId: stringValue(panel.document_id),
    generatedLines: Array.isArray(panel.generated_lines) ? panel.generated_lines : [],
    id: stringValue(panel.id),
    lastViewedAt: stringValue(panel.last_viewed_at),
    originalContent: stringValue(panel.original_content),
    suggestedQuestions: panel.suggested_questions,
    templateSlug: stringValue(panel.template_slug),
    title: stringValue(panel.title),
    updatedAt: stringValue(panel.updated_at),
  };
}

export function parseDocument(value: unknown): GranolaDocument {
  const record = asRecord(value);
  if (!record) {
    throw new Error("document payload is not an object");
  }

  return {
    content: stringValue(record.content),
    createdAt: stringValue(record.created_at),
    id: stringValue(record.id),
    lastViewedPanel: parseLastViewedPanel(record.last_viewed_panel),
    notes: parseProseMirrorDoc(record.notes),
    notesPlain: stringValue(record.notes_plain),
    tags: stringArray(record.tags),
    title: stringValue(record.title),
    updatedAt: stringValue(record.updated_at),
  };
}
