import { createGranolaApp } from "../app/index.ts";
import { openExternalUrl } from "../browser.ts";
import { loadConfig } from "../config.ts";
import {
  defaultGranolaServiceRecord,
  discoverGranolaService,
  readGranolaServiceLogTail,
  spawnGranolaServiceProcess,
  stopGranolaServiceProcess,
  waitForGranolaService,
} from "../service.ts";
import { buildGranolaMeetingUrl } from "../web-url.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";
import { serialiseManagedServiceFlags } from "./service-shared.ts";
import { resolveGranolaWebWorkspaceOptions, runGranolaWebWorkspace } from "./web-shared.ts";

function webHelp(): string {
  return `Granola web

Usage:
  granola web [options]

Options:
  --meeting <id>         Open a specific meeting on load
  --foreground           Run the web workspace in the current process instead of the background service
  --restart              Stop any existing background service first, then start a fresh one
  --network <mode>        Network mode: local or lan (default: local)
  --hostname <value>      Hostname to bind (overrides network default)
  --port <value>          Port to bind (default: 0 for any available port)
  --password <value>      Optional server password for API and browser access
  --sync-interval <value> Background sync interval, e.g. 15m or 1h (default: 15m)
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

function canReuseRunningService(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): boolean {
  const hasRuntimeOverride =
    commandFlags.cache !== undefined ||
    commandFlags.foreground !== undefined ||
    commandFlags.hostname !== undefined ||
    commandFlags.network !== undefined ||
    commandFlags["no-sync"] !== undefined ||
    commandFlags.password !== undefined ||
    commandFlags.port !== undefined ||
    commandFlags["sync-interval"] !== undefined ||
    commandFlags.timeout !== undefined ||
    commandFlags["trusted-origins"] !== undefined;

  const hasGlobalOverride =
    globalFlags["api-key"] !== undefined ||
    globalFlags.config !== undefined ||
    globalFlags.rules !== undefined ||
    globalFlags.supabase !== undefined;

  return !hasRuntimeOverride && !hasGlobalOverride;
}

function targetWebUrl(serviceUrl: string, meetingId?: string): URL {
  return meetingId ? buildGranolaMeetingUrl(new URL(serviceUrl), meetingId) : new URL(serviceUrl);
}

export const webCommand: CommandDefinition = {
  description: "Open the Granola Toolkit web workspace",
  flags: {
    cache: { type: "string" },
    foreground: { type: "boolean" },
    help: { type: "boolean" },
    hostname: { type: "string" },
    meeting: { type: "string" },
    network: { type: "string" },
    "no-sync": { type: "boolean" },
    open: { type: "boolean" },
    password: { type: "string" },
    port: { type: "string" },
    restart: { type: "boolean" },
    "sync-interval": { type: "string" },
    timeout: { type: "string" },
    "trusted-origins": { type: "string" },
  },
  help: webHelp,
  name: "web",
  async run({ commandFlags, globalFlags }) {
    const options = resolveGranolaWebWorkspaceOptions(commandFlags);
    const runForeground = commandFlags.foreground === true;
    const restartRequested = commandFlags.restart === true;
    const targetMeetingId =
      typeof commandFlags.meeting === "string" && commandFlags.meeting.trim()
        ? commandFlags.meeting.trim()
        : undefined;
    const useManagedService =
      !runForeground && (restartRequested || canReuseRunningService(commandFlags, globalFlags));

    if (restartRequested) {
      const stopResult = await stopGranolaServiceProcess();
      if (stopResult === "stopped") {
        console.log("Granola Toolkit stopped the previous background service.");
      } else if (stopResult === "force-stopped") {
        console.log("Granola Toolkit force-stopped the previous background service.");
      }
    }

    if (useManagedService) {
      if (!restartRequested) {
        const runningService = await discoverGranolaService();
        if (runningService) {
          const targetUrl = targetWebUrl(runningService.url, targetMeetingId);
          console.log(`Granola Toolkit web workspace already running on ${runningService.url}`);
          if (targetUrl.href !== runningService.url) {
            console.log(`Focused meeting URL: ${targetUrl.href}`);
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
          return 0;
        }
      }

      const { args, env } = serialiseManagedServiceFlags(commandFlags, globalFlags);
      await loadConfig({
        env,
        globalFlags,
        subcommandFlags: commandFlags,
      });
      await spawnGranolaServiceProcess({
        commandArgs: args,
        env,
        logFile: defaultGranolaServiceRecord().logFile,
      });

      const startedService = await waitForGranolaService();
      if (startedService.kind !== "running" || !startedService.record) {
        const logTail = await readGranolaServiceLogTail();
        throw new Error(
          logTail
            ? `web service failed to start cleanly:\n${logTail}`
            : "web service failed to start cleanly",
        );
      }

      const targetUrl = targetWebUrl(startedService.record.url, targetMeetingId);
      console.log(
        restartRequested
          ? `Granola Toolkit background service restarted on ${startedService.record.url}`
          : `Granola Toolkit background service started on ${startedService.record.url}`,
      );
      if (targetUrl.href !== startedService.record.url) {
        console.log(`Focused meeting URL: ${targetUrl.href}`);
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
      return 0;
    }

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

    return await runGranolaWebWorkspace(app, {
      ...options,
      targetMeetingId,
    });
  },
};
