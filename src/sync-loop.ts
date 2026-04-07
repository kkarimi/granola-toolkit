import type { GranolaAppApi, GranolaAppSyncResult } from "./app/index.ts";
import { isGranolaRateLimitError } from "./client/errors.ts";

type SetTimeoutLike = typeof setTimeout;
type ClearTimeoutLike = typeof clearTimeout;

export interface GranolaSyncLoop {
  start(options?: { immediate?: boolean }): void;
  stop(): Promise<void>;
}

export interface CreateGranolaSyncLoopOptions {
  app: Pick<GranolaAppApi, "sync">;
  clearTimeoutImpl?: ClearTimeoutLike;
  intervalMs: number;
  logger?: Pick<Console, "warn">;
  maxRateLimitBackoffMs?: number;
  onError?: (error: unknown) => Promise<void> | void;
  onSynced?: (result: GranolaAppSyncResult) => Promise<void> | void;
  rateLimitBackoffMs?: number;
  setTimeoutImpl?: SetTimeoutLike;
}

export function createGranolaSyncLoop(options: CreateGranolaSyncLoopOptions): GranolaSyncLoop {
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  const defaultRateLimitBackoffMs = Math.max(options.intervalMs * 4, 60 * 60_000);
  const maxRateLimitBackoffMs = Math.max(
    options.maxRateLimitBackoffMs ?? defaultRateLimitBackoffMs * 4,
    defaultRateLimitBackoffMs,
  );
  const rateLimitBackoffMs = Math.min(
    Math.max(options.rateLimitBackoffMs ?? defaultRateLimitBackoffMs, options.intervalMs),
    maxRateLimitBackoffMs,
  );
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;

  let consecutiveRateLimitFailures = 0;
  let inFlight: Promise<void> | undefined;
  let stopped = true;
  let timer: ReturnType<SetTimeoutLike> | undefined;

  const formatDelayLabel = (delayMs: number): string => {
    if (delayMs % 3_600_000 === 0) {
      const hours = delayMs / 3_600_000;
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }

    if (delayMs % 60_000 === 0) {
      const minutes = delayMs / 60_000;
      return `${minutes} min`;
    }

    if (delayMs % 1_000 === 0) {
      const seconds = delayMs / 1_000;
      return `${seconds} sec`;
    }

    return `${delayMs}ms`;
  };

  const rateLimitDelayMs = (): number => {
    const multiplier = 2 ** Math.max(0, consecutiveRateLimitFailures - 1);
    return Math.min(rateLimitBackoffMs * multiplier, maxRateLimitBackoffMs);
  };

  const schedule = (delayMs = options.intervalMs): void => {
    if (stopped) {
      return;
    }

    timer = setTimeoutImpl(() => {
      void runCycle();
    }, delayMs);
  };

  const runCycle = async (): Promise<void> => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = (async () => {
      let nextDelayMs = options.intervalMs;
      try {
        const result = await options.app.sync({
          forceRefresh: true,
          foreground: false,
        });
        consecutiveRateLimitFailures = 0;
        await options.onSynced?.(result);
      } catch (error) {
        if (isGranolaRateLimitError(error)) {
          consecutiveRateLimitFailures += 1;
          nextDelayMs = rateLimitDelayMs();
          options.logger?.warn?.(
            `background sync hit Granola rate limits; backing off for ${formatDelayLabel(nextDelayMs)} before the next check`,
          );
        } else {
          consecutiveRateLimitFailures = 0;
          options.logger?.warn?.(
            `background sync failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        await options.onError?.(error);
      } finally {
        inFlight = undefined;
        schedule(nextDelayMs);
      }
    })();

    await inFlight;
  };

  return {
    start(loopOptions = {}) {
      if (!stopped) {
        return;
      }

      stopped = false;
      if (loopOptions.immediate === false) {
        schedule();
        return;
      }

      void runCycle();
    },
    async stop() {
      stopped = true;
      if (timer !== undefined) {
        clearTimeoutImpl(timer);
        timer = undefined;
      }
      await inFlight;
    },
  };
}
