import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import * as appModule from "../src/app/index.ts";
import * as configModule from "../src/config.ts";
import {
  createCommandAppContext,
  shouldStartBackgroundSyncImmediately,
} from "../src/commands/shared.ts";
import type { AppConfig } from "../src/types.ts";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    configFileUsed: "/tmp/.granola.toml",
    debug: true,
    notes: {
      output: "/tmp/notes",
      timeoutMs: 120_000,
    },
    supabase: "/tmp/supabase.json",
    transcripts: {
      cacheFile: "/tmp/cache.json",
      output: "/tmp/transcripts",
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createCommandAppContext", () => {
  test("loads config, creates the app, and logs the requested debug fields", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = makeConfig();
    const app = {
      getState: () => ({
        auth: {
          mode: "api-key",
        },
      }),
    };

    const loadConfig = vi.spyOn(configModule, "loadConfig").mockResolvedValue(config);
    const createGranolaApp = vi
      .spyOn(appModule, "createGranolaApp")
      .mockResolvedValue(app as never);

    const result = await createCommandAppContext(
      {
        timeout: "30s",
      },
      {
        debug: true,
      },
      {
        includeCacheFile: true,
        includeSupabase: true,
        includeTimeoutMs: true,
        surface: "web",
      },
    );

    expect(loadConfig).toHaveBeenCalledWith({
      globalFlags: {
        debug: true,
      },
      subcommandFlags: {
        timeout: "30s",
      },
    });
    expect(createGranolaApp).toHaveBeenCalledWith(config, {
      surface: "web",
    });
    expect(result).toEqual({
      app,
      config,
    });
    expect(error).toHaveBeenCalledWith("[debug]", "using config", "/tmp/.granola.toml");
    expect(error).toHaveBeenCalledWith("[debug]", "supabase", "/tmp/supabase.json");
    expect(error).toHaveBeenCalledWith("[debug]", "cacheFile", "/tmp/cache.json");
    expect(error).toHaveBeenCalledWith("[debug]", "timeoutMs", 120_000);
    expect(error).toHaveBeenCalledWith("[debug]", "authMode", "api-key");
  });

  test("omits optional debug fields when they are not requested", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = makeConfig({
      configFileUsed: undefined,
      debug: true,
    });
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(config);
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    await createCommandAppContext({}, {});

    expect(error).toHaveBeenCalledWith("[debug]", "using config", "(none)");
    expect(error).toHaveBeenCalledWith("[debug]", "authMode", "stored-session");
    expect(error).not.toHaveBeenCalledWith("[debug]", "supabase", expect.anything());
    expect(error).not.toHaveBeenCalledWith("[debug]", "cacheFile", expect.anything());
    expect(error).not.toHaveBeenCalledWith("[debug]", "timeoutMs", expect.anything());
  });
});

describe("shouldStartBackgroundSyncImmediately", () => {
  test("starts immediately when no local index is available yet", () => {
    expect(
      shouldStartBackgroundSyncImmediately({
        index: {
          available: true,
          filePath: "/tmp/meeting-index.json",
          loaded: false,
          meetingCount: 0,
        },
        sync: {
          eventCount: 0,
          eventsFile: "/tmp/sync-events.jsonl",
          filePath: "/tmp/sync-state.json",
          lastChanges: [],
          running: false,
        },
      } as never),
    ).toBe(true);
  });

  test("skips the immediate refresh when the last sync is recent", () => {
    const now = new Date("2026-04-06T12:00:00Z").valueOf();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    expect(
      shouldStartBackgroundSyncImmediately(
        {
          index: {
            available: true,
            filePath: "/tmp/meeting-index.json",
            loaded: true,
            loadedAt: "2026-04-06T11:55:00Z",
            meetingCount: 700,
          },
          sync: {
            eventCount: 0,
            eventsFile: "/tmp/sync-events.jsonl",
            filePath: "/tmp/sync-state.json",
            lastChanges: [],
            lastCompletedAt: "2026-04-06T11:58:00Z",
            running: false,
          },
        } as never,
        15 * 60 * 1000,
      ),
    ).toBe(false);

    vi.useRealTimers();
  });
});
