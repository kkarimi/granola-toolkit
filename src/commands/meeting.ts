import { existsSync } from "node:fs";

import { createDefaultGranolaApiClient, loadOptionalGranolaCache } from "../client/default.ts";
import { loadConfig } from "../config.ts";
import {
  buildMeetingRecord,
  listMeetings,
  renderMeetingExport,
  renderMeetingList,
  renderMeetingView,
  resolveMeeting,
  type MeetingDetailOutputFormat,
  type MeetingExportOutputFormat,
  type MeetingListOutputFormat,
} from "../meetings.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function meetingHelp(): string {
  return `Granola meeting

Usage:
  granola meeting <list|view|export> [options]

Subcommands:
  list                List meetings from the Granola API
  view <id>           Show a single meeting with notes and transcript text
  export <id>         Export a single meeting as JSON or YAML

Options:
  --cache <path>      Path to Granola cache JSON for transcript data
  --format <value>    list/view: text, json, yaml; export: json, yaml
  --limit <n>         Number of meetings for list (default: 20)
  --search <query>    Filter list by title, id, or tag
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

function resolveListFormat(value: string | boolean | undefined): MeetingListOutputFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid meeting format: expected text, json, or yaml");
  }
}

function resolveViewFormat(value: string | boolean | undefined): MeetingDetailOutputFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid meeting format: expected text, json, or yaml");
  }
}

function resolveExportFormat(value: string | boolean | undefined): MeetingExportOutputFormat {
  switch (value) {
    case undefined:
      return "json";
    case "json":
    case "yaml":
      return value;
    default:
      throw new Error("invalid meeting export format: expected json or yaml");
  }
}

function parseLimit(value: string | boolean | undefined): number {
  if (value === undefined) {
    return 20;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("invalid meeting limit: expected a positive integer");
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("invalid meeting limit: expected a positive integer");
  }

  return limit;
}

export const meetingCommand: CommandDefinition = {
  description: "Inspect and export individual Granola meetings",
  flags: {
    cache: { type: "string" },
    format: { type: "string" },
    help: { type: "boolean" },
    limit: { type: "string" },
    search: { type: "string" },
    timeout: { type: "string" },
  },
  help: meetingHelp,
  name: "meeting",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const [action, id] = commandArgs;

    switch (action) {
      case "list":
        return await list(commandFlags, globalFlags);
      case "view":
        if (!id) {
          throw new Error("meeting view requires an id");
        }
        return await view(id, commandFlags, globalFlags);
      case "export":
        if (!id) {
          throw new Error("meeting export requires an id");
        }
        return await exportMeeting(id, commandFlags, globalFlags);
      case undefined:
        console.log(meetingHelp());
        return 1;
      default:
        throw new Error("invalid meeting command: expected list, view, or export");
    }
  },
};

async function loadMeetingData(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
) {
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });

  if (config.transcripts.cacheFile && !existsSync(config.transcripts.cacheFile)) {
    throw new Error(`Granola cache file not found: ${config.transcripts.cacheFile}`);
  }

  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);

  const granolaClient = await createDefaultGranolaApiClient(config);
  const cacheData = await loadOptionalGranolaCache(config.transcripts.cacheFile);

  return { cacheData, config, granolaClient };
}

async function list(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveListFormat(commandFlags.format);
  const limit = parseLimit(commandFlags.limit);
  const search = typeof commandFlags.search === "string" ? commandFlags.search : undefined;

  const { cacheData, config, granolaClient } = await loadMeetingData(commandFlags, globalFlags);
  console.log("Fetching meetings from Granola API...");
  const documents = await granolaClient.listDocuments({ timeoutMs: config.notes.timeoutMs });
  const meetings = listMeetings(documents, {
    cacheData,
    limit,
    search,
  });

  console.log(renderMeetingList(meetings, format).trimEnd());
  return 0;
}

async function view(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveViewFormat(commandFlags.format);

  const { cacheData, config, granolaClient } = await loadMeetingData(commandFlags, globalFlags);
  console.log("Fetching meeting from Granola API...");
  const documents = await granolaClient.listDocuments({ timeoutMs: config.notes.timeoutMs });
  const document = resolveMeeting(documents, id);
  const meeting = buildMeetingRecord(document, cacheData);

  console.log(renderMeetingView(meeting, format).trimEnd());
  return 0;
}

async function exportMeeting(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveExportFormat(commandFlags.format);

  const { cacheData, config, granolaClient } = await loadMeetingData(commandFlags, globalFlags);
  console.log("Fetching meeting from Granola API...");
  const documents = await granolaClient.listDocuments({ timeoutMs: config.notes.timeoutMs });
  const document = resolveMeeting(documents, id);
  const meeting = buildMeetingRecord(document, cacheData);

  console.log(renderMeetingExport(meeting, format).trimEnd());
  return 0;
}
