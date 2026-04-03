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
