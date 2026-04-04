import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { runGranolaTui } from "../tui/workspace.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function tuiHelp(): string {
  return `Granola tui

Usage:
  granola tui [options]

Options:
  --meeting <id>     Open the workspace focused on a specific meeting
  --cache <path>     Path to Granola cache JSON
  --timeout <value>  Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>  Path to supabase.json
  --debug            Enable debug logging
  --config <path>    Path to .granola.toml
  -h, --help         Show help
`;
}

export const tuiCommand: CommandDefinition = {
  description: "Start the Granola Toolkit terminal workspace",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    meeting: { type: "string" },
    timeout: { type: "string" },
  },
  help: tuiHelp,
  name: "tui",
  async run({ commandFlags, globalFlags }) {
    const config = await loadConfig({
      globalFlags,
      subcommandFlags: commandFlags,
    });

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "supabase", config.supabase);
    debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
    debug(config.debug, "timeoutMs", config.notes.timeoutMs);

    const app = await createGranolaApp(config, {
      surface: "tui",
    });
    const initialMeetingId =
      typeof commandFlags.meeting === "string" && commandFlags.meeting.trim()
        ? commandFlags.meeting.trim()
        : undefined;

    return await runGranolaTui(app, {
      initialMeetingId,
    });
  },
};
