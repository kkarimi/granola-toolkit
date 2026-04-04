import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { createGranolaSyncLoop } from "../sync-loop.ts";
import { runGranolaTui } from "../tui/workspace.ts";

import { debug, parseSyncInterval, syncEnabled } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function tuiHelp(): string {
  return `Granola tui

Usage:
  granola tui [options]

Options:
  --meeting <id>     Open the workspace focused on a specific meeting
  --sync-interval <value> Background sync interval, e.g. 60s or 5m (default: 60s)
  --no-sync          Disable the background sync loop
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
    "no-sync": { type: "boolean" },
    "sync-interval": { type: "string" },
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
    const backgroundSyncEnabled = syncEnabled(commandFlags);
    const syncIntervalMs = parseSyncInterval(commandFlags["sync-interval"]);
    const syncLoop = backgroundSyncEnabled
      ? createGranolaSyncLoop({
          app,
          intervalMs: syncIntervalMs,
          logger: console,
        })
      : undefined;
    syncLoop?.start();
    debug(
      config.debug,
      "backgroundSync",
      backgroundSyncEnabled ? `${syncIntervalMs}ms` : "disabled",
    );

    return await runGranolaTui(app, {
      initialMeetingId,
      onClose: async () => {
        await syncLoop?.stop();
      },
    });
  },
};
