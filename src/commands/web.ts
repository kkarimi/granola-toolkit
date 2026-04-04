import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";
import { resolveGranolaWebWorkspaceOptions, runGranolaWebWorkspace } from "./web-shared.ts";

function webHelp(): string {
  return `Granola web

Usage:
  granola web [options]

Options:
  --meeting <id>         Open a specific meeting on load
  --network <mode>        Network mode: local or lan (default: local)
  --hostname <value>      Hostname to bind (overrides network default)
  --port <value>          Port to bind (default: 0 for any available port)
  --password <value>      Optional server password for API and browser access
  --sync-interval <value> Background sync interval, e.g. 60s or 5m (default: 60s)
  --no-sync               Disable the background sync loop
  --trusted-origins <v>   Comma-separated extra browser origins to trust
  --cache <path>          Path to Granola cache JSON
  --timeout <value>       Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>       Path to supabase.json
  --open[=true|false]     Open the browser automatically (default: true)
  --debug                 Enable debug logging
  --config <path>         Path to .granola.toml
  -h, --help              Show help
`;
}

export const webCommand: CommandDefinition = {
  description: "Start the Granola Toolkit web workspace",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    hostname: { type: "string" },
    meeting: { type: "string" },
    network: { type: "string" },
    "no-sync": { type: "boolean" },
    open: { type: "boolean" },
    password: { type: "string" },
    port: { type: "string" },
    "sync-interval": { type: "string" },
    timeout: { type: "string" },
    "trusted-origins": { type: "string" },
  },
  help: webHelp,
  name: "web",
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
      surface: "web",
    });
    const options = resolveGranolaWebWorkspaceOptions(commandFlags);
    const targetMeetingId =
      typeof commandFlags.meeting === "string" && commandFlags.meeting.trim()
        ? commandFlags.meeting.trim()
        : undefined;

    return await runGranolaWebWorkspace(app, {
      ...options,
      targetMeetingId,
    });
  },
};
