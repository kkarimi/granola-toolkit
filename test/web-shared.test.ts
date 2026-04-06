import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  runGranolaWebWorkspace,
  resolveGranolaWebWorkspaceOptions,
} from "../src/commands/web-shared.ts";
import * as browserModule from "../src/browser.ts";
import * as serverModule from "../src/server/http.ts";
import * as sharedModule from "../src/commands/shared.ts";
import * as syncLoopModule from "../src/sync-loop.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("web workspace helpers", () => {
  test("resolves launch options from flags", () => {
    expect(
      resolveGranolaWebWorkspaceOptions({
        hostname: "granola.local",
        network: "lan",
        open: false,
        password: "secret-pass",
        port: "4096",
        "trusted-origins": "https://app.example, https://admin.example",
      }),
    ).toEqual({
      hostname: "granola.local",
      networkMode: "lan",
      openBrowser: false,
      password: "secret-pass",
      port: 4096,
      syncEnabled: true,
      syncIntervalMs: 900_000,
      trustedOrigins: ["https://app.example", "https://admin.example"],
    });
  });

  test("starts the browser workspace and focuses a meeting URL", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const openExternalUrl = vi.spyOn(browserModule, "openExternalUrl").mockResolvedValue();
    const app = {
      getState: () => ({
        index: {
          loaded: false,
          meetingCount: 0,
        },
        sync: {},
      }),
    } as never;
    const close = vi.fn(async () => {});
    const stopSyncLoop = vi.fn(async () => {});
    const startGranolaServer = vi.spyOn(serverModule, "startGranolaServer").mockResolvedValue({
      app,
      close,
      hostname: "127.0.0.1",
      port: 4096,
      server: {} as never,
      url: new URL("http://127.0.0.1:4096"),
    });
    const startSyncLoop = vi.fn();
    vi.spyOn(syncLoopModule, "createGranolaSyncLoop").mockReturnValue({
      start: startSyncLoop,
      stop: stopSyncLoop,
    });
    vi.spyOn(sharedModule, "waitForShutdown").mockImplementation(async (shutdown) => {
      await shutdown();
    });

    const exitCode = await runGranolaWebWorkspace(app, {
      hostname: "127.0.0.1",
      networkMode: "local",
      openBrowser: true,
      port: 4096,
      syncEnabled: true,
      syncIntervalMs: 60_000,
      targetMeetingId: "doc-alpha-1111",
      trustedOrigins: [],
    });

    expect(exitCode).toBe(0);
    expect(startGranolaServer).toHaveBeenCalledWith(app, {
      enableWebClient: true,
      hostname: "127.0.0.1",
      port: 4096,
      runtime: {
        mode: "web-workspace",
        syncEnabled: true,
        syncIntervalMs: 60_000,
      },
      security: {
        password: undefined,
        trustedOrigins: [],
      },
    });
    expect(String(openExternalUrl.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:4096/?meeting=doc-alpha-1111",
    );
    expect(startSyncLoop).toHaveBeenCalledWith({
      immediate: true,
    });
    expect(stopSyncLoop).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Focused meeting URL: http://127.0.0.1:4096/?meeting=doc-alpha-1111",
    );
    expect(log).toHaveBeenCalledWith("Background sync: enabled (60000ms)");
    expect(close).toHaveBeenCalled();
  });

  test("reports browser-open failures without aborting startup", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(browserModule, "openExternalUrl").mockRejectedValue(new Error("open failed"));
    const app = {
      getState: () => ({
        index: {
          loaded: false,
          meetingCount: 0,
        },
        sync: {},
      }),
    } as never;
    vi.spyOn(serverModule, "startGranolaServer").mockResolvedValue({
      app,
      close: vi.fn(async () => {}),
      hostname: "0.0.0.0",
      port: 4096,
      server: {} as never,
      url: new URL("http://0.0.0.0:4096"),
    });
    vi.spyOn(syncLoopModule, "createGranolaSyncLoop").mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(async () => {}),
    });
    vi.spyOn(sharedModule, "waitForShutdown").mockResolvedValue();

    const exitCode = await runGranolaWebWorkspace(app, {
      hostname: "0.0.0.0",
      networkMode: "lan",
      openBrowser: true,
      password: undefined,
      port: 4096,
      syncEnabled: true,
      syncIntervalMs: 60_000,
      trustedOrigins: [],
    });

    expect(exitCode).toBe(0);
    expect(error).toHaveBeenCalledWith("failed to open browser automatically: open failed");
    expect(error).toHaveBeenCalledWith("open http://0.0.0.0:4096/ manually");
  });
});
