import { afterEach, describe, expect, test, vi } from "vite-plus/test";

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
});
