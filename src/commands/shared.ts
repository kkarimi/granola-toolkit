import { existsSync } from "node:fs";

import {
  createGranolaApp,
  type GranolaApp,
  type GranolaAppState,
  type GranolaAppSurface,
} from "../app/index.ts";
import { loadConfig, type FlagValues } from "../config.ts";
import type { AppConfig } from "../types.ts";
import { parseDuration } from "../utils.ts";

export function debug(enabled: boolean, ...values: unknown[]): void {
  if (enabled) {
    console.error("[debug]", ...values);
  }
}

export interface CommandAppContext {
  app: GranolaApp;
  config: AppConfig;
}

export interface CommandAppContextOptions {
  includeCacheFile?: boolean;
  includeSupabase?: boolean;
  includeTimeoutMs?: boolean;
  surface?: GranolaAppSurface;
}

export const DEFAULT_BACKGROUND_SYNC_INTERVAL_MS = 15 * 60 * 1000;
export const DEFAULT_SYNC_WATCH_INTERVAL_MS = 60 * 1000;

function logCommandConfig(config: AppConfig, options: CommandAppContextOptions): void {
  debug(config.debug, "using config", config.configFileUsed ?? "(none)");

  if (options.includeSupabase) {
    debug(config.debug, "supabase", config.supabase);
  }

  if (options.includeCacheFile) {
    debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  }

  if (options.includeTimeoutMs) {
    debug(config.debug, "timeoutMs", config.notes.timeoutMs);
  }
}

function validateCommandConfigPaths(
  commandFlags: FlagValues,
  config: AppConfig,
  globalFlags: FlagValues,
  options: CommandAppContextOptions,
): void {
  if (
    options.includeSupabase &&
    typeof globalFlags.supabase === "string" &&
    config.supabase &&
    !existsSync(config.supabase)
  ) {
    throw new Error(`supabase.json not found: ${config.supabase}`);
  }

  if (
    options.includeCacheFile &&
    typeof commandFlags.cache === "string" &&
    config.transcripts.cacheFile &&
    !existsSync(config.transcripts.cacheFile)
  ) {
    throw new Error(`Granola cache file not found: ${config.transcripts.cacheFile}`);
  }
}

export async function createCommandAppContext(
  commandFlags: FlagValues,
  globalFlags: FlagValues,
  options: CommandAppContextOptions = {},
): Promise<CommandAppContext> {
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });

  validateCommandConfigPaths(commandFlags, config, globalFlags, options);
  logCommandConfig(config, options);
  const app = await createGranolaApp(config, {
    surface: options.surface,
  });
  debug(config.debug, "authMode", app.getState().auth.mode);

  return { app, config };
}

export function parsePort(value: string | boolean | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("invalid port: expected a non-negative integer");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("invalid port: expected a value between 0 and 65535");
  }

  return port;
}

export function pickHostname(value: string | boolean | undefined, fallback = "127.0.0.1"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export type ServerNetworkMode = "lan" | "local";

export function parseNetworkMode(
  value: string | boolean | undefined,
  fallback: ServerNetworkMode = "local",
): ServerNetworkMode {
  switch (value) {
    case undefined:
      return fallback;
    case "lan":
    case "local":
      return value;
    default:
      throw new Error("invalid network mode: expected local or lan");
  }
}

export function resolveServerHostname(
  networkMode: ServerNetworkMode,
  hostnameFlag: string | boolean | undefined,
): string {
  if (hostnameFlag !== undefined) {
    return pickHostname(hostnameFlag, networkMode === "lan" ? "0.0.0.0" : "127.0.0.1");
  }

  return networkMode === "lan" ? "0.0.0.0" : "127.0.0.1";
}

export function parseTrustedOrigins(value: string | boolean | undefined): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function parseSyncInterval(
  value: string | boolean | undefined,
  fallbackMs = DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
): number {
  if (value === undefined) {
    return fallbackMs;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("invalid sync interval: expected a duration like 60s or 5m");
  }

  return parseDuration(value);
}

export function shouldStartBackgroundSyncImmediately(
  state: GranolaAppState,
  intervalMs = DEFAULT_BACKGROUND_SYNC_INTERVAL_MS,
): boolean {
  if (!state?.index?.loaded || (state.index.meetingCount ?? 0) === 0) {
    return true;
  }

  const lastCompletedAt = state.sync?.lastCompletedAt;
  if (!lastCompletedAt) {
    return true;
  }

  const lastCompletedAtMs = Date.parse(lastCompletedAt);
  if (!Number.isFinite(lastCompletedAtMs)) {
    return true;
  }

  return Date.now() - lastCompletedAtMs >= intervalMs;
}

export function syncEnabled(commandFlags: Record<string, string | boolean | undefined>): boolean {
  return commandFlags["no-sync"] !== true;
}

export async function waitForShutdown(close: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let closing = false;

    const cleanup = () => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    };

    const finish = async () => {
      if (closing) {
        return;
      }

      closing = true;
      cleanup();

      try {
        await close();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    const handleSignal = () => {
      void finish();
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
  });
}
