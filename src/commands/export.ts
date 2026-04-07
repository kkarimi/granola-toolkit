import { join } from "node:path";

import { renderExportScopeLabel } from "../export-scope.ts";
import type { NoteOutputFormat, TranscriptOutputFormat } from "../types.ts";

import { createCommandAppContext, debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

type ExportMode = "both" | "notes" | "transcripts";

function exportHelp(): string {
  return `Granola export

Usage:
  granola export [options]

By default this exports notes and transcripts together.

Options:
  --folder <query>             Export only meetings inside one folder id or name
  --output <path>              Shared output root; writes notes to <path>/notes and transcripts to <path>/transcripts
  --notes-output <path>        Output directory for note files
  --transcripts-output <path>  Output directory for transcript files
  --notes-format <value>       Notes format: markdown, json, yaml, raw (default: markdown)
  --transcripts-format <value> Transcript format: text, json, yaml, raw (default: text)
  --notes-only                 Export only notes
  --transcripts-only           Export only transcripts
  --cache <path>               Path to Granola desktop transcript file
  --timeout <value>            Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>            Path to supabase.json
  --debug                      Enable debug logging
  --config <path>              Path to .granola.toml
  -h, --help                   Show help
`;
}

function resolveExportMode(
  notesOnly: string | boolean | undefined,
  transcriptsOnly: string | boolean | undefined,
): ExportMode {
  if (notesOnly === true && transcriptsOnly === true) {
    throw new Error("cannot combine --notes-only and --transcripts-only");
  }

  if (notesOnly === true) {
    return "notes";
  }

  if (transcriptsOnly === true) {
    return "transcripts";
  }

  return "both";
}

function resolveNoteFormat(value: string | boolean | undefined): NoteOutputFormat {
  switch (value) {
    case undefined:
      return "markdown";
    case "json":
    case "markdown":
    case "raw":
    case "yaml":
      return value;
    default:
      throw new Error("invalid notes format: expected markdown, json, yaml, or raw");
  }
}

function resolveTranscriptFormat(value: string | boolean | undefined): TranscriptOutputFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "raw":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid transcripts format: expected text, json, yaml, or raw");
  }
}

function resolveSharedOutputRoot(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const exportCommand: CommandDefinition = {
  description: "Export notes and transcripts together",
  flags: {
    cache: { type: "string" },
    folder: { type: "string" },
    help: { type: "boolean" },
    "notes-format": { type: "string" },
    "notes-only": { type: "boolean" },
    "notes-output": { type: "string" },
    output: { type: "string" },
    timeout: { type: "string" },
    "transcripts-format": { type: "string" },
    "transcripts-only": { type: "boolean" },
    "transcripts-output": { type: "string" },
  },
  help: exportHelp,
  name: "export",
  async run({ commandFlags, globalFlags }) {
    const mode = resolveExportMode(commandFlags["notes-only"], commandFlags["transcripts-only"]);
    const exportNotes = mode !== "transcripts";
    const exportTranscripts = mode !== "notes";

    const { app, config } = await createCommandAppContext(commandFlags, globalFlags, {
      includeCacheFile: exportTranscripts,
      includeSupabase: exportNotes,
      includeTimeoutMs: exportNotes,
    });

    const folderQuery = typeof commandFlags.folder === "string" ? commandFlags.folder : undefined;
    const folder = folderQuery ? await app.findFolder(folderQuery) : undefined;
    const scopeLabel = renderExportScopeLabel(
      folder
        ? {
            folderId: folder.id,
            folderName: folder.name,
            mode: "folder",
          }
        : { mode: "all" },
    );
    const outputRoot = resolveSharedOutputRoot(commandFlags.output);
    const noteFormat = resolveNoteFormat(commandFlags["notes-format"]);
    const transcriptFormat = resolveTranscriptFormat(commandFlags["transcripts-format"]);
    const notesOutput =
      typeof commandFlags["notes-output"] === "string"
        ? commandFlags["notes-output"]
        : outputRoot
          ? join(outputRoot, "notes")
          : undefined;
    const transcriptsOutput =
      typeof commandFlags["transcripts-output"] === "string"
        ? commandFlags["transcripts-output"]
        : outputRoot
          ? join(outputRoot, "transcripts")
          : undefined;

    debug(config.debug, "mode", mode);
    debug(config.debug, "folder", folder?.id ?? "(all)");
    debug(config.debug, "notesFormat", noteFormat);
    debug(config.debug, "transcriptsFormat", transcriptFormat);
    debug(config.debug, "notesOutput", notesOutput ?? config.notes.output);
    debug(config.debug, "transcriptsOutput", transcriptsOutput ?? config.transcripts.output);

    const notesResult = exportNotes
      ? await app.exportNotes(noteFormat, {
          folderId: folder?.id,
          outputDir: notesOutput,
          scopedOutput: notesOutput === undefined,
        })
      : undefined;
    const transcriptsResult = exportTranscripts
      ? await app.exportTranscripts(transcriptFormat, {
          folderId: folder?.id,
          outputDir: transcriptsOutput,
          scopedOutput: transcriptsOutput === undefined,
        })
      : undefined;

    if (notesResult && transcriptsResult) {
      console.log(
        [
          `✓ Exported notes and transcripts from ${scopeLabel}`,
          `  notes: ${notesResult.documentCount} -> ${notesResult.outputDir} (job ${notesResult.job.id})`,
          `  transcripts: ${transcriptsResult.transcriptCount} -> ${transcriptsResult.outputDir} (job ${transcriptsResult.job.id})`,
        ].join("\n"),
      );
      return 0;
    }

    if (notesResult) {
      console.log(
        `✓ Exported ${notesResult.documentCount} notes from ${scopeLabel} to ${notesResult.outputDir} (job ${notesResult.job.id})`,
      );
      return 0;
    }

    if (transcriptsResult) {
      console.log(
        `✓ Exported ${transcriptsResult.transcriptCount} transcripts from ${scopeLabel} to ${transcriptsResult.outputDir} (job ${transcriptsResult.job.id})`,
      );
      return 0;
    }

    throw new Error("nothing to export");
  },
};
