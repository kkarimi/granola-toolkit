import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { granolaClientHttpError } from "../src/client/errors.ts";
import { createGranolaSyncLoop } from "../src/sync-loop.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createGranolaSyncLoop", () => {
  test("runs repeated sync cycles until stopped", async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => ({
      changes: [],
      state: {
        eventCount: 0,
        eventsFile: "/tmp/sync-events.jsonl",
        filePath: "/tmp/sync-state.json",
        lastChanges: [],
        running: false,
      },
      summary: {
        changedCount: 0,
        createdCount: 0,
        folderCount: 0,
        meetingCount: 0,
        removedCount: 0,
        transcriptReadyCount: 0,
      },
    }));

    const loop = createGranolaSyncLoop({
      app: { sync },
      intervalMs: 1_000,
    });

    loop.start({ immediate: false });
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith({
      forceRefresh: true,
      foreground: false,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(2);

    await loop.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sync).toHaveBeenCalledTimes(2);
  });

  test("backs off after Granola rate limits and resets after a healthy sync", async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    let attempts = 0;
    const sync = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw granolaClientHttpError(
          "sync failed",
          429,
          "Too Many Requests",
          '{"code":"RATE_LIMITED"}',
        );
      }

      return {
        changes: [],
        state: {
          eventCount: 0,
          eventsFile: "/tmp/sync-events.jsonl",
          filePath: "/tmp/sync-state.json",
          lastChanges: [],
          running: false,
        },
        summary: {
          changedCount: 0,
          createdCount: 0,
          folderCount: 0,
          meetingCount: 0,
          removedCount: 0,
          transcriptReadyCount: 0,
        },
      };
    });

    const loop = createGranolaSyncLoop({
      app: { sync },
      intervalMs: 1_000,
      logger: { warn },
      rateLimitBackoffMs: 10_000,
    });

    loop.start({ immediate: false });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "background sync hit Granola rate limits; backing off for 10 sec before the next check",
    );

    await vi.advanceTimersByTimeAsync(9_000);
    expect(sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(3);

    await loop.stop();
  });
});
