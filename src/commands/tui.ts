import { createGranolaApp } from "../app/index.ts";
import { createGranolaServerClient } from "../server/client.ts";
import { loadConfig } from "../config.ts";
import {
  defaultGranolaServiceRecord,
  discoverGranolaService,
  readGranolaServiceLogTail,
  spawnGranolaServiceProcess,
  stopGranolaServiceProcess,
  waitForGranolaService,
} from "../service.ts";
import { createGranolaSyncLoop } from "../sync-loop.ts";
import { runGranolaTui } from "../tui/workspace.ts";

import {
  debug,
  DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
  parseSyncInterval,
  shouldStartBackgroundSyncImmediately,
  syncEnabled,
} from "./shared.ts";
import { serialiseManagedServiceFlags } from "./service-shared.ts";
import type { CommandDefinition } from "./types.ts";

function canReuseRunningService(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): boolean {
  const hasRuntimeOverride =
    commandFlags.cache !== undefined ||
    commandFlags["no-sync"] !== undefined ||
    commandFlags["sync-interval"] !== undefined ||
    commandFlags.timeout !== undefined;

  const hasGlobalOverride =
    globalFlags["api-key"] !== undefined ||
    globalFlags.config !== undefined ||
    globalFlags.rules !== undefined ||
    globalFlags.supabase !== undefined;

  return !hasRuntimeOverride && !hasGlobalOverride;
}

function tuiHelp(): string {
  return `Granola tui

Usage:
  granola tui [options]

Options:
  --meeting <id>     Open the workspace focused on a specific meeting
  --foreground       Run the terminal workspace in the current process instead of the background service
  --restart          Stop any existing background service first, then start a fresh one
  --password <value> Server password for protected local APIs
  --sync-interval <value> Background sync interval, e.g. 15m or 1h (default: 15m)
  --no-sync          Disable the background sync loop
  --cache <path>     Path to Granola desktop transcript file
  --timeout <value>  Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>  Path to supabase.json
  --debug            Enable debug logging
  --config <path>    Path to .granola.toml
  -h, --help         Show help
`;
}

export const tuiCommand: CommandDefinition = {
  description: "Start the Granola Toolkit terminal workspace",
  flags: {
    cache: { type: "string" },
    foreground: { type: "boolean" },
    help: { type: "boolean" },
    meeting: { type: "string" },
    "no-sync": { type: "boolean" },
    password: { type: "string" },
    restart: { type: "boolean" },
    "sync-interval": { type: "string" },
    timeout: { type: "string" },
  },
  help: tuiHelp,
  name: "tui",
  async run({ commandFlags, globalFlags }) {
    const runForeground = commandFlags.foreground === true;
    const restartRequested = commandFlags.restart === true;
    const password =
      typeof commandFlags.password === "string" && commandFlags.password.trim()
        ? commandFlags.password.trim()
        : undefined;
    const useManagedService =
      !runForeground && (restartRequested || canReuseRunningService(commandFlags, globalFlags));
    const initialMeetingId =
      typeof commandFlags.meeting === "string" && commandFlags.meeting.trim()
        ? commandFlags.meeting.trim()
        : undefined;

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
          console.log(`Attaching to Granola Toolkit background service at ${runningService.url}`);
          const app = await createGranolaServerClient(runningService.url, {
            password,
          });
          return await runGranolaTui(app, {
            initialMeetingId,
          });
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
            ? `tui background service failed to start cleanly:\n${logTail}`
            : "tui background service failed to start cleanly",
        );
      }

      console.log(
        restartRequested
          ? `Granola Toolkit background service restarted on ${startedService.record.url}`
          : `Granola Toolkit background service started on ${startedService.record.url}`,
      );
      const app = await createGranolaServerClient(startedService.record.url, {
        password,
      });
      return await runGranolaTui(app, {
        initialMeetingId,
      });
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
      surface: "tui",
    });
    const backgroundSyncEnabled = syncEnabled(commandFlags);
    const syncIntervalMs = parseSyncInterval(
      commandFlags["sync-interval"],
      DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
    );
    const syncLoop = backgroundSyncEnabled
      ? createGranolaSyncLoop({
          app,
          intervalMs: syncIntervalMs,
          logger: console,
        })
      : undefined;
    syncLoop?.start({
      immediate: shouldStartBackgroundSyncImmediately(app.getState(), syncIntervalMs),
    });
    debug(
      config.debug,
      "backgroundSync",
      backgroundSyncEnabled ? `${syncIntervalMs}ms` : "disabled",
    );

    return await runGranolaTui(app, {
      initialMeetingId,
      onClose: async () => {
        await syncLoop?.stop();
      },
    });
  },
};
