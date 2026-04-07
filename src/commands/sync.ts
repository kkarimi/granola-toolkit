import { createGranolaApp, type GranolaAppSyncResult } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { createGranolaSyncLoop } from "../sync-loop.ts";

import {
  debug,
  DEFAULT_SYNC_WATCH_INTERVAL_MS,
  parseSyncInterval,
  waitForShutdown,
} from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function syncHelp(): string {
  return `Granola sync

Usage:
  granola sync [options]
  granola sync events [options]

Options:
  --watch             Keep syncing in the background until interrupted
  --interval <value>  Poll interval for --watch, e.g. 60s or 5m (default: 60s)
  --limit <value>     Event count for sync events output (default: 20)
  --cache <path>      Path to Granola desktop transcript file
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

function pluralise(count: number, singular: string, plural = singular): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function printSyncResult(
  result: GranolaAppSyncResult,
  log: typeof console.log = console.log,
): void {
  log(
    `✓ Synced ${pluralise(result.summary.meetingCount, "meeting", "meetings")} across ${pluralise(result.summary.folderCount, "folder", "folders")} (${pluralise(result.summary.createdCount, "created")}, ${pluralise(result.summary.changedCount, "updated")}, ${pluralise(result.summary.removedCount, "removed")}, ${pluralise(result.summary.transcriptReadyCount, "transcript ready", "transcripts ready")})`,
  );

  const lines = result.changes.slice(0, 10).map((change) => {
    const label = change.kind.padEnd(16);
    return `  ${label} ${change.title} (${change.meetingId})`;
  });
  for (const line of lines) {
    log(line);
  }
  if (result.changes.length > lines.length) {
    log(`  ...and ${result.changes.length - lines.length} more change(s)`);
  }
}

export const syncCommand: CommandDefinition = {
  description: "Refresh the local meeting index and sync state",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    interval: { type: "string" },
    limit: { type: "string" },
    timeout: { type: "string" },
    watch: { type: "boolean" },
  },
  help: syncHelp,
  name: "sync",
  async run({ commandArgs, commandFlags, globalFlags }) {
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

    if (commandArgs[0] === "events") {
      const limit =
        typeof commandFlags.limit === "string" && /^\d+$/.test(commandFlags.limit)
          ? Number(commandFlags.limit)
          : 20;
      const result = await app.listSyncEvents({ limit });
      if (result.events.length === 0) {
        console.log("No sync events yet.");
        return 0;
      }

      for (const event of result.events) {
        console.log(
          `${event.occurredAt} ${event.kind.padEnd(18)} ${event.title} (${event.meetingId})`,
        );
      }
      return 0;
    }

    const result = await app.sync();
    printSyncResult(result);
    if (result.state.lastCompletedAt) {
      debug(config.debug, "syncCompletedAt", result.state.lastCompletedAt);
    }

    if (commandFlags.watch === true) {
      const intervalMs = parseSyncInterval(commandFlags.interval, DEFAULT_SYNC_WATCH_INTERVAL_MS);
      const syncLoop = createGranolaSyncLoop({
        app,
        intervalMs,
        logger: console,
        onError: async (error) => {
          console.error(error instanceof Error ? error.message : String(error));
        },
        onSynced: async (nextResult) => {
          printSyncResult(nextResult);
        },
      });
      syncLoop.start({ immediate: false });
      console.log(`Watching for Granola changes every ${intervalMs}ms. Press Ctrl+C to stop.`);
      await waitForShutdown(async () => {
        await syncLoop.stop();
      });
    }

    return 0;
  },
};
