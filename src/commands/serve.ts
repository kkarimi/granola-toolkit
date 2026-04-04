import { createGranolaApp } from "../app/index.ts";
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

function serveHelp(): string {
  return `Granola serve

Usage:
  granola serve [options]

Options:
  --network <mode>        Network mode: local or lan (default: local)
  --hostname <value>      Hostname to bind (overrides network default)
  --port <value>          Port to bind (default: 0 for any available port)
  --password <value>      Optional server password for API and browser access
  --trusted-origins <v>   Comma-separated extra browser origins to trust
  --cache <path>          Path to Granola cache JSON
  --timeout <value>       Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>       Path to supabase.json
  --debug                 Enable debug logging
  --config <path>         Path to .granola.toml
  -h, --help              Show help
`;
}

export const serveCommand: CommandDefinition = {
  description: "Start a local Granola API server",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    hostname: { type: "string" },
    network: { type: "string" },
    password: { type: "string" },
    port: { type: "string" },
    timeout: { type: "string" },
    "trusted-origins": { type: "string" },
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
    const networkMode = parseNetworkMode(commandFlags.network);
    const hostname = resolveServerHostname(networkMode, commandFlags.hostname);
    const port = parsePort(commandFlags.port);
    const password =
      typeof commandFlags.password === "string" && commandFlags.password.trim()
        ? commandFlags.password
        : undefined;
    const trustedOrigins = parseTrustedOrigins(commandFlags["trusted-origins"]);
    const server = await startGranolaServer(app, {
      hostname,
      port,
      security: {
        password,
        trustedOrigins,
      },
    });

    console.log(`Granola server listening on ${server.url.href}`);
    console.log(`Network mode: ${networkMode}`);
    if (password) {
      console.log("Server password protection: enabled");
    } else if (networkMode === "lan") {
      console.log("Warning: LAN mode is enabled without a server password");
    }
    if (trustedOrigins.length > 0) {
      console.log(`Trusted origins: ${trustedOrigins.join(", ")}`);
    }
    console.log("Endpoints:");
    console.log("  GET  /health");
    console.log("  GET  /server/info");
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
    console.log("  POST /sync");
    console.log(`Attach: granola attach ${server.url.href}`);
    if (password) {
      console.log("Attach password: add --password <value>");
    }

    await waitForShutdown(async () => await server.close());

    return 0;
  },
};
