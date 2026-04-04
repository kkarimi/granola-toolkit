import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { startGranolaServer } from "../server/http.ts";

import { debug, parsePort, pickHostname, waitForShutdown } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function serveHelp(): string {
  return `Granola serve

Usage:
  granola serve [options]

Options:
  --hostname <value>  Hostname to bind (default: 127.0.0.1)
  --port <value>      Port to bind (default: 0 for any available port)
  --cache <path>      Path to Granola cache JSON
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

export const serveCommand: CommandDefinition = {
  description: "Start a local Granola API server",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    hostname: { type: "string" },
    port: { type: "string" },
    timeout: { type: "string" },
  },
  help: serveHelp,
  name: "serve",
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
      surface: "server",
    });
    const hostname = pickHostname(commandFlags.hostname);
    const port = parsePort(commandFlags.port);
    const server = await startGranolaServer(app, {
      hostname,
      port,
    });

    console.log(`Granola server listening on ${server.url.href}`);
    console.log("Endpoints:");
    console.log("  GET  /health");
    console.log("  GET  /state");
    console.log("  GET  /events");
    console.log("  GET  /meetings");
    console.log("  GET  /meetings/:id");
    console.log("  GET  /exports/jobs");
    console.log("  POST /exports/notes");
    console.log("  POST /exports/jobs/:id/rerun");
    console.log("  POST /exports/transcripts");

    await waitForShutdown(async () => await server.close());

    return 0;
  },
};
