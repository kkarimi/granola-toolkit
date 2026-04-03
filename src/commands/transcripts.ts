import { readFile } from "node:fs/promises";

import { parseCacheContents } from "../cache.ts";
import { loadConfig } from "../config.ts";
import { writeTranscripts } from "../transcripts.ts";
import { granolaCacheCandidates } from "../utils.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function transcriptsHelp(): string {
  return `Granola transcripts

Usage:
  granola transcripts [options]

Options:
  --cache <path>      Path to Granola cache JSON
  --output <path>     Output directory for transcript files (default: ./transcripts)
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

export const transcriptsCommand: CommandDefinition = {
  description: "Export Granola transcripts to text files",
  flags: {
    cache: { type: "string" },
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

    if (!config.transcripts.cacheFile) {
      throw new Error(
        `Granola cache file not found. Pass --cache or create .granola.toml. Expected locations include: ${granolaCacheCandidates().join(", ")}`,
      );
    }

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "cacheFile", config.transcripts.cacheFile);
    debug(config.debug, "output", config.transcripts.output);

    console.log("Reading Granola cache file...");
    const cacheContents = await readFile(config.transcripts.cacheFile, "utf8");
    const cacheData = parseCacheContents(cacheContents);
    const transcriptCount = Object.values(cacheData.transcripts).filter(
      (segments) => segments.length > 0,
    ).length;

    console.log(`Exporting ${transcriptCount} transcripts to ${config.transcripts.output}...`);
    const written = await writeTranscripts(cacheData, config.transcripts.output);
    console.log("✓ Export completed successfully");
    debug(config.debug, "transcripts written", written);
    return 0;
  },
};
