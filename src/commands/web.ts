import { createGranolaApp } from "../app/index.ts";
import { openExternalUrl } from "../browser.ts";
import { loadConfig } from "../config.ts";
import { discoverGranolaService } from "../service.ts";
import { buildGranolaMeetingUrl } from "../web-url.ts";

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

function canReuseRunningService(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): boolean {
  const hasRuntimeOverride =
    commandFlags.cache !== undefined ||
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
    const options = resolveGranolaWebWorkspaceOptions(commandFlags);
    const targetMeetingId =
      typeof commandFlags.meeting === "string" && commandFlags.meeting.trim()
        ? commandFlags.meeting.trim()
        : undefined;

    if (canReuseRunningService(commandFlags, globalFlags)) {
      const runningService = await discoverGranolaService();
      if (runningService) {
        const targetUrl = targetMeetingId
          ? buildGranolaMeetingUrl(new URL(runningService.url), targetMeetingId)
          : new URL(runningService.url);
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
