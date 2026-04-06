import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { createGranolaSyncLoop } from "../sync-loop.ts";
import { runGranolaTui } from "../tui/workspace.ts";

import {
  debug,
  DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
  parseSyncInterval,
  shouldStartBackgroundSyncImmediately,
  syncEnabled,
} from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function tuiHelp(): string {
  return `Granola tui

Usage:
  granola tui [options]

Options:
  --meeting <id>     Open the workspace focused on a specific meeting
  --sync-interval <value> Background sync interval, e.g. 15m or 1h (default: 15m)
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
    const syncIntervalMs = parseSyncInterval(
      commandFlags["sync-interval"],
      DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
    );
    const syncLoop = backgroundSyncEnabled
      ? createGranolaSyncLoop({
          app,
          intervalMs: syncIntervalMs,
          logger: console,
        })
      : undefined;
    syncLoop?.start({
      immediate: shouldStartBackgroundSyncImmediately(app.getState(), syncIntervalMs),
    });
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
