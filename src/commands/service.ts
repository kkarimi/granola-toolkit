import { createGranolaApp } from "../app/index.ts";
import { GRANOLA_TRANSPORT_PROTOCOL_VERSION } from "../transport.ts";
import type { FlagValues } from "../config.ts";
import { loadConfig } from "../config.ts";
import { startGranolaServer } from "../server/http.ts";
import {
  defaultGranolaServiceRecord,
  discoverGranolaService,
  inspectGranolaService,
  readGranolaServiceLogTail,
  removeGranolaServiceRecord,
  spawnGranolaServiceProcess,
  stopGranolaServiceProcess,
  waitForGranolaService,
  writeGranolaServiceRecord,
} from "../service.ts";
import { createGranolaSyncLoop } from "../sync-loop.ts";
import { serialiseManagedServiceFlags } from "./service-shared.ts";

import {
  DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
  debug,
  parseNetworkMode,
  parsePort,
  parseSyncInterval,
  parseTrustedOrigins,
  resolveServerHostname,
  shouldStartBackgroundSyncImmediately,
  syncEnabled,
  waitForShutdown,
} from "./shared.ts";
import type { CommandDefinition } from "./types.ts";
import type { AppConfig } from "../types.ts";

function serviceHelp(): string {
  return `Granola service

Usage:
  granola service start [options]
  granola service status
  granola service stop

Options:
  --network <mode>        Network mode: local or lan (default: local)
  --hostname <value>      Hostname to bind (overrides network default)
  --port <value>          Port to bind (default: 0 for any available port)
  --password <value>      Optional server password for API and browser access
  --sync-interval <value> Background sync interval, e.g. 15m or 1h (default: 15m)
  --no-sync               Disable the background sync loop
  --trusted-origins <v>   Comma-separated extra browser origins to trust
  --cache <path>          Path to Granola desktop transcript file
  --timeout <value>       Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>       Path to supabase.json
  --debug                 Enable debug logging
  --config <path>         Path to .granola.toml
  -h, --help              Show help
`;
}

function printServiceStatus(status: Awaited<ReturnType<typeof inspectGranolaService>>): void {
  switch (status.kind) {
    case "running":
      console.log(`Granola Toolkit service is running on ${status.record?.url}`);
      console.log(`PID: ${status.record?.pid}`);
      console.log(`Log: ${status.record?.logFile}`);
      console.log(
        status.record?.syncEnabled
          ? `Background sync: enabled (${status.record.syncIntervalMs}ms)`
          : "Background sync: disabled",
      );
      if (status.record?.passwordProtected) {
        console.log("Password protection: enabled");
      }
      return;
    case "stale":
      console.log("Granola Toolkit service metadata exists, but the process is not running.");
      return;
    case "unreachable":
      console.log("Granola Toolkit service metadata exists, but the server did not respond.");
      if (status.record?.url) {
        console.log(`Last known URL: ${status.record.url}`);
      }
      if (status.error) {
        console.log(`Health check: ${status.error.message}`);
      }
      return;
    case "invalid":
      console.log("Granola Toolkit service metadata is invalid.");
      return;
    case "missing":
    default:
      console.log("Granola Toolkit service is not running.");
  }
}

function printServiceRunBanner(record: {
  passwordProtected: boolean;
  syncEnabled: boolean;
  syncIntervalMs: number;
  url: string;
}): void {
  console.log(`Granola Toolkit background service listening on ${record.url}`);
  console.log(
    record.syncEnabled
      ? `Background sync: enabled (${record.syncIntervalMs}ms)`
      : "Background sync: disabled",
  );
  if (record.passwordProtected) {
    console.log("Password protection: enabled");
  }
}

async function runServiceProcess(config: AppConfig, commandFlags: FlagValues): Promise<number> {
  const networkMode = parseNetworkMode(commandFlags.network);
  const hostname = resolveServerHostname(networkMode, commandFlags.hostname);
  const port = parsePort(commandFlags.port);
  const password =
    typeof commandFlags.password === "string" && commandFlags.password.trim()
      ? commandFlags.password.trim()
      : undefined;
  const syncEnabledForService = syncEnabled(commandFlags);
  const syncIntervalMs = parseSyncInterval(
    commandFlags["sync-interval"],
    DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
  );
  const trustedOrigins = parseTrustedOrigins(commandFlags["trusted-origins"]);
  const { logFile, serviceStateFile } = defaultGranolaServiceRecord();

  const app = await createGranolaApp(config, {
    surface: "server",
  });
  const server = await startGranolaServer(app, {
    enableWebClient: true,
    hostname,
    port,
    runtime: {
      mode: "background-service",
      syncEnabled: syncEnabledForService,
      syncIntervalMs,
    },
    security: {
      password,
      trustedOrigins,
    },
  });
  const syncLoop = syncEnabledForService
    ? createGranolaSyncLoop({
        app,
        intervalMs: syncIntervalMs,
        logger: console,
      })
    : undefined;

  const record = {
    hostname: server.hostname,
    logFile,
    passwordProtected: Boolean(password),
    pid: process.pid,
    port: server.port,
    protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
    startedAt: new Date().toISOString(),
    syncEnabled: syncEnabledForService,
    syncIntervalMs,
    url: server.url.href,
  } as const;

  await writeGranolaServiceRecord(record, serviceStateFile);
  syncLoop?.start({
    immediate: shouldStartBackgroundSyncImmediately(app.getState(), syncIntervalMs),
  });
  printServiceRunBanner(record);

  await waitForShutdown(async () => {
    await syncLoop?.stop();
    await server.close();
    await removeGranolaServiceRecord(serviceStateFile);
  });

  return 0;
}

export const serviceCommand: CommandDefinition = {
  description: "Run and manage the Granola Toolkit background service",
  flags: {
    cache: { type: "string" },
    help: { type: "boolean" },
    hostname: { type: "string" },
    network: { type: "string" },
    "no-sync": { type: "boolean" },
    password: { type: "string" },
    port: { type: "string" },
    "sync-interval": { type: "string" },
    timeout: { type: "string" },
    "trusted-origins": { type: "string" },
  },
  help: serviceHelp,
  name: "service",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const action = commandArgs[0];

    if (!action) {
      console.log(serviceHelp());
      return 1;
    }

    if (action === "status") {
      const status = await inspectGranolaService();
      printServiceStatus(status);
      return status.kind === "running" ? 0 : 1;
    }

    if (action === "stop") {
      const result = await stopGranolaServiceProcess();
      if (result === "missing") {
        console.log("Granola Toolkit service is not running.");
        return 0;
      }

      console.log(
        result === "force-stopped"
          ? "Granola Toolkit service force-stopped."
          : "Granola Toolkit service stopped.",
      );
      return 0;
    }

    if (action === "run") {
      const config = await loadConfig({
        globalFlags,
        subcommandFlags: commandFlags,
      });
      debug(config.debug, "using config", config.configFileUsed ?? "(none)");
      debug(config.debug, "supabase", config.supabase);
      debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
      debug(config.debug, "timeoutMs", config.notes.timeoutMs);
      return await runServiceProcess(config, commandFlags);
    }

    if (action === "start") {
      const existing = await discoverGranolaService();
      if (existing) {
        console.log(`Granola Toolkit service is already running on ${existing.url}`);
        console.log(`PID: ${existing.pid}`);
        return 0;
      }

      await loadConfig({
        env:
          typeof globalFlags["api-key"] === "string" && globalFlags["api-key"].trim()
            ? { ...process.env, GRANOLA_API_KEY: globalFlags["api-key"].trim() }
            : process.env,
        globalFlags,
        subcommandFlags: commandFlags,
      });
      const { args, env } = serialiseManagedServiceFlags(commandFlags, globalFlags);
      await spawnGranolaServiceProcess({
        commandArgs: args,
        env,
        logFile: defaultGranolaServiceRecord().logFile,
      });

      const status = await waitForGranolaService();
      if (status.kind !== "running" || !status.record) {
        const logTail = await readGranolaServiceLogTail();
        throw new Error(
          logTail
            ? `service failed to start cleanly:\n${logTail}`
            : "service failed to start cleanly",
        );
      }

      console.log(`Granola Toolkit service started on ${status.record.url}`);
      console.log(`PID: ${status.record.pid}`);
      console.log(`Log: ${status.record.logFile}`);
      return 0;
    }

    throw new Error(`unknown service command: ${action}`);
  },
};
