import { createGranolaApp } from "../app/index.ts";
import { openExternalUrl } from "../browser.ts";
import { loadConfig } from "../config.ts";
import { startGranolaServer } from "../server/http.ts";

import { debug, parsePort, pickHostname, waitForShutdown } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function webHelp(): string {
  return `Granola web

Usage:
  granola web [options]

Options:
  --hostname <value>      Hostname to bind (default: 127.0.0.1)
  --port <value>          Port to bind (default: 0 for any available port)
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
    open: { type: "boolean" },
    port: { type: "string" },
    timeout: { type: "string" },
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
    const hostname = pickHostname(commandFlags.hostname);
    const port = parsePort(commandFlags.port);
    const openBrowser = commandFlags.open !== false;

    const server = await startGranolaServer(app, {
      enableWebClient: true,
      hostname,
      port,
    });

    console.log(`Granola Toolkit web workspace listening on ${server.url.href}`);
    console.log("Routes:");
    console.log("  GET  /");
    console.log("  GET  /health");
    console.log("  GET  /state");
    console.log("  GET  /events");
    console.log("  GET  /meetings");
    console.log("  GET  /meetings/:id");
    console.log("  POST /exports/notes");
    console.log("  POST /exports/transcripts");

    if (openBrowser) {
      try {
        await openExternalUrl(server.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to open browser automatically: ${message}`);
        console.error(`open ${server.url.href} manually`);
      }
    }

    await waitForShutdown(async () => await server.close());

    return 0;
  },
};
