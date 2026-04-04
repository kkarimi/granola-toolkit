import { createGranolaApp } from "../app/index.ts";
import { openExternalUrl } from "../browser.ts";
import { loadConfig } from "../config.ts";
import { startGranolaServer } from "../server/http.ts";

import {
  debug,
  parseNetworkMode,
  parsePort,
  parseTrustedOrigins,
  resolveServerHostname,
  waitForShutdown,
} from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function webHelp(): string {
  return `Granola web

Usage:
  granola web [options]

Options:
  --network <mode>        Network mode: local or lan (default: local)
  --hostname <value>      Hostname to bind (overrides network default)
  --port <value>          Port to bind (default: 0 for any available port)
  --password <value>      Optional server password for API and browser access
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
    network: { type: "string" },
    open: { type: "boolean" },
    password: { type: "string" },
    port: { type: "string" },
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
    const networkMode = parseNetworkMode(commandFlags.network);
    const hostname = resolveServerHostname(networkMode, commandFlags.hostname);
    const port = parsePort(commandFlags.port);
    const openBrowser = commandFlags.open !== false;
    const password =
      typeof commandFlags.password === "string" && commandFlags.password.trim()
        ? commandFlags.password
        : undefined;
    const trustedOrigins = parseTrustedOrigins(commandFlags["trusted-origins"]);

    const server = await startGranolaServer(app, {
      enableWebClient: true,
      hostname,
      port,
      security: {
        password,
        trustedOrigins,
      },
    });

    console.log(`Granola Toolkit web workspace listening on ${server.url.href}`);
    console.log(`Network mode: ${networkMode}`);
    if (password) {
      console.log("Server password protection: enabled");
    } else if (networkMode === "lan") {
      console.log("Warning: LAN mode is enabled without a server password");
    }
    if (trustedOrigins.length > 0) {
      console.log(`Trusted origins: ${trustedOrigins.join(", ")}`);
    }
    console.log("Routes:");
    console.log("  GET  /");
    console.log("  GET  /health");
    console.log("  POST /auth/unlock");
    console.log("  POST /auth/lock");
    console.log("  GET  /auth/status");
    console.log("  GET  /state");
    console.log("  GET  /events");
    console.log("  GET  /meetings");
    console.log("  GET  /meetings/:id");
    console.log("  GET  /exports/jobs");
    console.log("  POST /auth/login");
    console.log("  POST /auth/logout");
    console.log("  POST /auth/mode");
    console.log("  POST /auth/refresh");
    console.log("  POST /exports/notes");
    console.log("  POST /exports/jobs/:id/rerun");
    console.log("  POST /exports/transcripts");
    console.log(`Attach: granola attach ${server.url.href}`);
    if (password) {
      console.log("Attach password: add --password <value>");
    }

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
