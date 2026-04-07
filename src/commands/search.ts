import { renderMeetingList, type MeetingListOutputFormat } from "../meetings.ts";

import { createCommandAppContext } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function searchHelp(): string {
  return `Granola search

Usage:
  granola search <query> [options]

Options:
  --folder <query>    Filter search results to one folder id or name
  --format <value>    text, json, yaml (default: text)
  --limit <n>         Number of meetings to show (default: 20)
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

function resolveFormat(value: string | boolean | undefined): MeetingListOutputFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid search format: expected text, json, or yaml");
  }
}

function parseLimit(value: string | boolean | undefined): number {
  if (value === undefined) {
    return 20;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("invalid search limit: expected a positive integer");
  }

  return Number(value);
}

export const searchCommand: CommandDefinition = {
  description: "Search meetings across titles, notes, transcripts, folders, tags, and artefacts",
  flags: {
    folder: { type: "string" },
    format: { type: "string" },
    help: { type: "boolean" },
    limit: { type: "string" },
    timeout: { type: "string" },
  },
  help: searchHelp,
  name: "search",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const query = commandArgs.join(" ").trim();
    if (!query) {
      console.log(searchHelp());
      return 1;
    }

    const format = resolveFormat(commandFlags.format);
    const limit = parseLimit(commandFlags.limit);
    const folderQuery = typeof commandFlags.folder === "string" ? commandFlags.folder : undefined;
    const { app } = await createCommandAppContext(commandFlags, globalFlags, {
      includeSupabase: true,
      includeTimeoutMs: true,
    });
    const folder = folderQuery ? await app.findFolder(folderQuery) : undefined;
    const result = await app.listMeetings({
      folderId: folder?.id,
      limit,
      preferIndex: true,
      search: query,
    });

    console.log(
      result.source === "index"
        ? "Searched the local index"
        : result.source === "snapshot"
          ? "Search index unavailable, fell back to the local snapshot"
          : "Search index unavailable, fell back to live meeting metadata",
    );
    console.log(renderMeetingList(result.meetings, format).trimEnd());
    return 0;
  },
};
