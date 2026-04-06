import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import {
  renderMeetingExport,
  renderMeetingList,
  renderMeetingNotes,
  renderMeetingTranscript,
  renderMeetingView,
  type MeetingDetailOutputFormat,
  type MeetingExportOutputFormat,
  type MeetingListOutputFormat,
  type MeetingNotesOutputFormat,
  type MeetingTranscriptOutputFormat,
} from "../meetings.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";
import { resolveGranolaWebWorkspaceOptions, runGranolaWebWorkspace } from "./web-shared.ts";

function meetingHelp(): string {
  return `Granola meeting

Usage:
  granola meeting <list|view|export|notes|transcript|open> [options]

Subcommands:
  list                List meetings from the Granola API
  view <id>           Show a single meeting with notes and transcript text
  export <id>         Export a single meeting as JSON or YAML
  notes <id>          Show a single meeting's notes
  transcript <id>     Show a single meeting's transcript
  open <id>           Start the web workspace focused on one meeting

Options:
  --cache <path>      Path to Granola cache JSON for transcript data
  --folder <query>    Filter list to one folder id or name
  --format <value>    list/view: text, json, yaml; export: json, yaml; notes: markdown, json, yaml, raw; transcript: text, json, yaml, raw
  --network <mode>    open: local or lan (default: local)
  --hostname <value>  open: hostname to bind (overrides network default)
  --limit <n>         Number of meetings for list (default: 20)
  --open[=true|false] open: launch the browser automatically (default: true)
  --password <value>  open: optional server password
  --port <value>      open: port to bind (default: 0 for any available port)
  --search <query>    Filter list by title, id, tags, notes, transcripts, or artefacts
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --trusted-origins <v> open: comma-separated extra browser origins to trust
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

function resolveNotesFormat(value: string | boolean | undefined): MeetingNotesOutputFormat {
  switch (value) {
    case undefined:
      return "markdown";
    case "json":
    case "markdown":
    case "raw":
    case "yaml":
      return value;
    default:
      throw new Error("invalid meeting notes format: expected markdown, json, yaml, or raw");
  }
}

function resolveTranscriptFormat(
  value: string | boolean | undefined,
): MeetingTranscriptOutputFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "raw":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid meeting transcript format: expected text, json, yaml, or raw");
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
    folder: { type: "string" },
    format: { type: "string" },
    help: { type: "boolean" },
    hostname: { type: "string" },
    limit: { type: "string" },
    network: { type: "string" },
    open: { type: "boolean" },
    password: { type: "string" },
    port: { type: "string" },
    search: { type: "string" },
    timeout: { type: "string" },
    "trusted-origins": { type: "string" },
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
      case "notes":
        if (!id) {
          throw new Error("meeting notes requires an id");
        }
        return await notes(id, commandFlags, globalFlags);
      case "transcript":
        if (!id) {
          throw new Error("meeting transcript requires an id");
        }
        return await transcript(id, commandFlags, globalFlags);
      case "open":
        if (!id) {
          throw new Error("meeting open requires an id");
        }
        return await openMeeting(id, commandFlags, globalFlags);
      case undefined:
        console.log(meetingHelp());
        return 1;
      default:
        throw new Error(
          "invalid meeting command: expected list, view, export, notes, transcript, or open",
        );
    }
  },
};

async function list(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveListFormat(commandFlags.format);
  const limit = parseLimit(commandFlags.limit);
  const folderQuery = typeof commandFlags.folder === "string" ? commandFlags.folder : undefined;
  const search = typeof commandFlags.search === "string" ? commandFlags.search : undefined;

  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);
  const app = await createGranolaApp(config);
  debug(config.debug, "authMode", app.getState().auth.mode);

  console.log("Loading meetings...");
  const folder = folderQuery ? await app.findFolder(folderQuery) : undefined;
  const folderId = folder?.id;
  const result = await app.listMeetings({ folderId, limit, search });
  console.log(
    result.source === "index"
      ? "Loaded meetings from the local index"
      : "Fetched meetings from Granola API",
  );
  if (folder) {
    console.log(`Folder: ${folder.name} (${folder.id})`);
  }

  console.log(renderMeetingList(result.meetings, format).trimEnd());
  return 0;
}

async function view(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveViewFormat(commandFlags.format);
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);
  const app = await createGranolaApp(config);
  debug(config.debug, "authMode", app.getState().auth.mode);

  console.log("Fetching meeting from Granola API...");
  const result = await app.getMeeting(id);

  console.log(renderMeetingView(result.meeting, format).trimEnd());
  return 0;
}

async function exportMeeting(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveExportFormat(commandFlags.format);
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);
  const app = await createGranolaApp(config);
  debug(config.debug, "authMode", app.getState().auth.mode);

  console.log("Fetching meeting from Granola API...");
  const result = await app.getMeeting(id);

  console.log(renderMeetingExport(result.meeting, format).trimEnd());
  return 0;
}

async function notes(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveNotesFormat(commandFlags.format);
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);
  const app = await createGranolaApp(config);
  debug(config.debug, "authMode", app.getState().auth.mode);

  console.log("Fetching meeting from Granola API...");
  const result = await app.getMeeting(id);

  console.log(renderMeetingNotes(result.document, format).trimEnd());
  return 0;
}

async function transcript(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveTranscriptFormat(commandFlags.format);
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);
  const app = await createGranolaApp(config);
  debug(config.debug, "authMode", app.getState().auth.mode);

  console.log("Fetching meeting from Granola API...");
  const result = await app.getMeeting(id);
  const output = renderMeetingTranscript(result.document, result.cacheData, format);
  if (!output.trim()) {
    throw new Error(`no transcript found for meeting: ${result.document.id}`);
  }

  console.log(output.trimEnd());
  return 0;
}

async function openMeeting(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  debug(config.debug, "timeoutMs", config.notes.timeoutMs);

  const app = await createGranolaApp(config, {
    surface: "web",
  });
  debug(config.debug, "authMode", app.getState().auth.mode);

  console.log("Resolving meeting from Granola API...");
  const result = await app.getMeeting(id);
  console.log(`Preparing web workspace for ${result.document.title || result.document.id}...`);

  return await runGranolaWebWorkspace(app, {
    ...resolveGranolaWebWorkspaceOptions(commandFlags),
    targetMeetingId: result.document.id,
  });
}
