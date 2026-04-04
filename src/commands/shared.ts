import { parseDuration } from "../utils.ts";

export function debug(enabled: boolean, ...values: unknown[]): void {
  if (enabled) {
    console.error("[debug]", ...values);
  }
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
  fallbackMs = 60_000,
): number {
  if (value === undefined) {
    return fallbackMs;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("invalid sync interval: expected a duration like 60s or 5m");
  }

  return parseDuration(value);
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
