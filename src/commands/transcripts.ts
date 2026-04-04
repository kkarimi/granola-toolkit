import { createGranolaApp } from "../app/index.ts";
import { renderExportScopeLabel } from "../export-scope.ts";
import { loadConfig } from "../config.ts";
import type { TranscriptOutputFormat } from "../types.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function transcriptsHelp(): string {
  return `Granola transcripts

Usage:
  granola transcripts [options]

Options:
  --cache <path>      Path to Granola cache JSON
  --folder <query>    Export only meetings inside one folder id or name
  --format <value>    Output format: text, json, yaml, raw (default: text)
  --output <path>     Output directory for transcript files (default: ./transcripts)
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

export const transcriptsCommand: CommandDefinition = {
  description: "Export Granola transcripts",
  flags: {
    cache: { type: "string" },
    folder: { type: "string" },
    format: { type: "string" },
    help: { type: "boolean" },
    output: { type: "string" },
  },
  help: transcriptsHelp,
  name: "transcripts",
  async run({ commandFlags, globalFlags }) {
    const config = await loadConfig({
      globalFlags,
      subcommandFlags: commandFlags,
    });

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "cacheFile", config.transcripts.cacheFile);
    debug(config.debug, "output", config.transcripts.output);
    const format = resolveTranscriptFormat(commandFlags.format);
    debug(config.debug, "format", format);
    const app = await createGranolaApp(config);
    debug(config.debug, "authMode", app.getState().auth.mode);
    const folderQuery = typeof commandFlags.folder === "string" ? commandFlags.folder : undefined;
    const folder = folderQuery ? await app.findFolder(folderQuery) : undefined;
    debug(config.debug, "folder", folder?.id ?? "(all)");

    const result = await app.exportTranscripts(format, {
      folderId: folder?.id,
      scopedOutput: typeof commandFlags.output !== "string",
    });
    console.log(
      `✓ Exported ${result.transcriptCount} transcripts from ${renderExportScopeLabel(result.scope)} to ${result.outputDir} (job ${result.job.id})`,
    );
    debug(config.debug, "transcripts written", result.written);
    return 0;
  },
};

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
