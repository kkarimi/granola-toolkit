import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function syncHelp(): string {
  return `Granola sync

Usage:
  granola sync [options]

Options:
  --cache <path>      Path to Granola cache JSON
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

export const syncCommand: CommandDefinition = {
  description: "Refresh the local meeting index and sync state",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    timeout: { type: "string" },
  },
  help: syncHelp,
  name: "sync",
  async run({ commandFlags, globalFlags }) {
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
    const result = await app.sync();

    console.log(
      `✓ Synced ${pluralise(result.summary.meetingCount, "meeting", "meetings")} across ${pluralise(result.summary.folderCount, "folder", "folders")} (${pluralise(result.summary.createdCount, "created")}, ${pluralise(result.summary.changedCount, "updated")}, ${pluralise(result.summary.removedCount, "removed")}, ${pluralise(result.summary.transcriptReadyCount, "transcript ready", "transcripts ready")})`,
    );

    const lines = result.changes.slice(0, 10).map((change) => {
      const label = change.kind.padEnd(16);
      return `  ${label} ${change.title} (${change.meetingId})`;
    });
    for (const line of lines) {
      console.log(line);
    }
    if (result.changes.length > lines.length) {
      console.log(`  ...and ${result.changes.length - lines.length} more change(s)`);
    }
    if (result.state.lastCompletedAt) {
      debug(config.debug, "syncCompletedAt", result.state.lastCompletedAt);
    }

    return 0;
  },
};
