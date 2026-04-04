import type { GranolaAppApi, GranolaAppSyncResult } from "./app/index.ts";

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
  onError?: (error: unknown) => Promise<void> | void;
  onSynced?: (result: GranolaAppSyncResult) => Promise<void> | void;
  setTimeoutImpl?: SetTimeoutLike;
}

export function createGranolaSyncLoop(options: CreateGranolaSyncLoopOptions): GranolaSyncLoop {
  const clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  const setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;

  let inFlight: Promise<void> | undefined;
  let stopped = true;
  let timer: ReturnType<SetTimeoutLike> | undefined;

  const schedule = (): void => {
    if (stopped) {
      return;
    }

    timer = setTimeoutImpl(() => {
      void runCycle();
    }, options.intervalMs);
  };

  const runCycle = async (): Promise<void> => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = (async () => {
      try {
        const result = await options.app.sync({
          forceRefresh: true,
          foreground: false,
        });
        await options.onSynced?.(result);
      } catch (error) {
        options.logger?.warn?.(
          `background sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        await options.onError?.(error);
      } finally {
        inFlight = undefined;
        schedule();
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
