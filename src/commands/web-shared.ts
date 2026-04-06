import type { GranolaApp } from "../app/core.ts";
import { openExternalUrl } from "../browser.ts";
import type { FlagValues } from "../config.ts";
import { startGranolaServer } from "../server/http.ts";
import { createGranolaSyncLoop } from "../sync-loop.ts";
import { buildGranolaMeetingUrl } from "../web-url.ts";

import {
  DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
  parseNetworkMode,
  parsePort,
  parseSyncInterval,
  parseTrustedOrigins,
  resolveServerHostname,
  shouldStartBackgroundSyncImmediately,
  syncEnabled,
  type ServerNetworkMode,
  waitForShutdown,
} from "./shared.ts";

export interface GranolaWebWorkspaceOptions {
  hostname: string;
  networkMode: ServerNetworkMode;
  openBrowser: boolean;
  password?: string;
  port?: number;
  syncEnabled: boolean;
  syncIntervalMs: number;
  targetMeetingId?: string;
  trustedOrigins: string[];
}

export function resolveGranolaWebWorkspaceOptions(
  commandFlags: FlagValues,
): GranolaWebWorkspaceOptions {
  const networkMode = parseNetworkMode(commandFlags.network);
  const hostname = resolveServerHostname(networkMode, commandFlags.hostname);
  const port = parsePort(commandFlags.port);
  const openBrowser = commandFlags.open !== false;
  const password =
    typeof commandFlags.password === "string" && commandFlags.password.trim()
      ? commandFlags.password.trim()
      : undefined;
  const backgroundSyncEnabled = syncEnabled(commandFlags);
  const syncIntervalMs = parseSyncInterval(
    commandFlags["sync-interval"],
    DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
  );
  const trustedOrigins = parseTrustedOrigins(commandFlags["trusted-origins"]);

  return {
    hostname,
    networkMode,
    openBrowser,
    password,
    port,
    syncEnabled: backgroundSyncEnabled,
    syncIntervalMs,
    trustedOrigins,
  };
}

function printWebRoutes(): void {
  console.log("Routes:");
  console.log("  GET  /");
  console.log("  GET  /health");
  console.log("  GET  /server/info");
  console.log("  POST /auth/unlock");
  console.log("  POST /auth/lock");
  console.log("  GET  /auth/status");
  console.log("  GET  /state");
  console.log("  GET  /events");
  console.log("  GET  /folders");
  console.log("  GET  /folders/resolve?q=<query>");
  console.log("  GET  /folders/:id");
  console.log("  GET  /meetings");
  console.log("  GET  /meetings?folderId=<id>");
  console.log("  GET  /meetings/:id");
  console.log("  GET  /exports/jobs");
  console.log("  POST /auth/login");
  console.log("  POST /auth/logout");
  console.log("  POST /auth/mode");
  console.log("  POST /auth/refresh");
  console.log("  POST /exports/notes");
  console.log("  POST /exports/jobs/:id/rerun");
  console.log("  POST /exports/transcripts");
  console.log("  GET  /sync/events");
  console.log("  POST /sync");
}

export async function runGranolaWebWorkspace(
  app: GranolaApp,
  options: GranolaWebWorkspaceOptions,
): Promise<number> {
  const server = await startGranolaServer(app, {
    enableWebClient: true,
    hostname: options.hostname,
    port: options.port,
    runtime: {
      mode: "web-workspace",
      syncEnabled: options.syncEnabled,
      syncIntervalMs: options.syncIntervalMs,
    },
    security: {
      password: options.password,
      trustedOrigins: options.trustedOrigins,
    },
  });
  const syncLoop = options.syncEnabled
    ? createGranolaSyncLoop({
        app,
        intervalMs: options.syncIntervalMs,
        logger: console,
      })
    : undefined;
  syncLoop?.start({
    immediate: shouldStartBackgroundSyncImmediately(app.getState(), options.syncIntervalMs),
  });
  const targetUrl = options.targetMeetingId
    ? buildGranolaMeetingUrl(server.url, options.targetMeetingId)
    : new URL(server.url);

  console.log(`Granola Toolkit web workspace listening on ${server.url.href}`);
  if (targetUrl.href !== server.url.href) {
    console.log(`Focused meeting URL: ${targetUrl.href}`);
  }
  console.log(`Network mode: ${options.networkMode}`);
  if (options.password) {
    console.log("Server password protection: enabled");
  } else if (options.networkMode === "lan") {
    console.log("Warning: LAN mode is enabled without a server password");
  }
  if (options.trustedOrigins.length > 0) {
    console.log(`Trusted origins: ${options.trustedOrigins.join(", ")}`);
  }
  console.log(
    options.syncEnabled
      ? `Background sync: enabled (${options.syncIntervalMs}ms)`
      : "Background sync: disabled",
  );
  printWebRoutes();
  console.log(`Attach: granola attach ${server.url.href}`);
  if (options.password) {
    console.log("Attach password: add --password <value>");
  }

  if (options.openBrowser) {
    try {
      await openExternalUrl(targetUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed to open browser automatically: ${message}`);
      console.error(`open ${targetUrl.href} manually`);
    }
  }

  await waitForShutdown(async () => {
    await syncLoop?.stop();
    await server.close();
  });
  return 0;
}
