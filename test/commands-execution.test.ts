import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { AppConfig } from "../src/types.ts";
import { attachCommand } from "../src/commands/attach.ts";
import { automationCommand } from "../src/commands/automation.ts";
import type { CommandContext } from "../src/commands/types.ts";
import { authCommand } from "../src/commands/auth.ts";
import { exportsCommand } from "../src/commands/exports.ts";
import { meetingCommand } from "../src/commands/meeting.ts";
import { notesCommand } from "../src/commands/notes.ts";
import { searchCommand } from "../src/commands/search.ts";
import { serviceCommand } from "../src/commands/service.ts";
import { serveCommand } from "../src/commands/serve.ts";
import { syncCommand } from "../src/commands/sync.ts";
import { tuiCommand } from "../src/commands/tui.ts";
import { transcriptsCommand } from "../src/commands/transcripts.ts";
import { webCommand } from "../src/commands/web.ts";
import * as appModule from "../src/app/index.ts";
import * as browserModule from "../src/browser.ts";
import * as configModule from "../src/config.ts";
import * as evaluationModule from "../src/evaluations.ts";
import * as serverClientModule from "../src/server/client.ts";
import * as serverModule from "../src/server/http.ts";
import * as serviceModule from "../src/service.ts";
import * as sharedModule from "../src/commands/shared.ts";
import * as syncLoopModule from "../src/sync-loop.ts";
import * as tuiWorkspaceModule from "../src/tui/workspace.ts";

function makeConfig(): AppConfig {
  return {
    debug: false,
    notes: {
      output: "/tmp/notes",
      timeoutMs: 120_000,
    },
    supabase: "/tmp/supabase.json",
    transcripts: {
      cacheFile: "/tmp/cache.json",
      output: "/tmp/transcripts",
    },
  };
}

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    commandArgs: [],
    commandFlags: {},
    globalFlags: {},
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("command execution", () => {
  test("notes command resolves folder scope and uses scoped output by default", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      exportNotes: vi.fn(async () => ({
        documentCount: 2,
        documents: [],
        format: "markdown",
        job: {
          completedCount: 2,
          format: "markdown",
          id: "notes-job-1",
          itemCount: 2,
          kind: "notes",
          outputDir: "/tmp/notes/_folders/folder-team-1111",
          scope: {
            folderId: "folder-team-1111",
            folderName: "Team",
            mode: "folder",
          },
          startedAt: "2024-03-01T12:00:00Z",
          status: "completed",
          written: 2,
        },
        outputDir: "/tmp/notes/_folders/folder-team-1111",
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
        written: 2,
      })),
      findFolder: vi.fn(async () => ({
        id: "folder-team-1111",
        name: "Team",
      })),
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await notesCommand.run(
      makeContext({
        commandFlags: {
          folder: "Team",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.findFolder).toHaveBeenCalledWith("Team");
    expect(app.exportNotes).toHaveBeenCalledWith("markdown", {
      folderId: "folder-team-1111",
      scopedOutput: true,
    });
    expect(log).toHaveBeenCalledWith(
      "✓ Exported 2 notes from folder Team to /tmp/notes/_folders/folder-team-1111 (job notes-job-1)",
    );
  });

  test("transcripts command disables scoped output when an explicit output path is provided", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      exportTranscripts: vi.fn(async () => ({
        cacheData: {
          documents: {},
          transcripts: {},
        },
        format: "text",
        job: {
          completedCount: 1,
          format: "text",
          id: "transcripts-job-1",
          itemCount: 1,
          kind: "transcripts",
          outputDir: "/tmp/custom-transcripts",
          scope: {
            folderId: "folder-team-1111",
            folderName: "Team",
            mode: "folder",
          },
          startedAt: "2024-03-01T12:00:00Z",
          status: "completed",
          written: 1,
        },
        outputDir: "/tmp/custom-transcripts",
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
        transcriptCount: 1,
        written: 1,
      })),
      findFolder: vi.fn(async () => ({
        id: "folder-team-1111",
        name: "Team",
      })),
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await transcriptsCommand.run(
      makeContext({
        commandFlags: {
          folder: "Team",
          output: "/tmp/custom-transcripts",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.exportTranscripts).toHaveBeenCalledWith("text", {
      folderId: "folder-team-1111",
      scopedOutput: false,
    });
    expect(log).toHaveBeenCalledWith(
      "✓ Exported 1 transcripts from folder Team to /tmp/custom-transcripts (job transcripts-job-1)",
    );
  });

  test("exports command prints scope-aware job history and rerun output", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      listExportJobs: vi.fn(async () => ({
        jobs: [
          {
            completedCount: 1,
            format: "markdown",
            id: "notes-job-1",
            itemCount: 1,
            kind: "notes",
            outputDir: "/tmp/notes/_folders/folder-team-1111",
            scope: {
              folderId: "folder-team-1111",
              folderName: "Team",
              mode: "folder",
            },
            startedAt: "2024-03-01T12:00:00Z",
            status: "completed",
            written: 1,
          },
        ],
      })),
      rerunExportJob: vi.fn(async () => ({
        documentCount: 1,
        documents: [],
        format: "markdown",
        job: {
          completedCount: 1,
          format: "markdown",
          id: "notes-job-2",
          itemCount: 1,
          kind: "notes",
          outputDir: "/tmp/notes/_folders/folder-team-1111",
          scope: {
            folderId: "folder-team-1111",
            folderName: "Team",
            mode: "folder",
          },
          startedAt: "2024-03-01T12:10:00Z",
          status: "completed",
          written: 1,
        },
        outputDir: "/tmp/notes/_folders/folder-team-1111",
        scope: {
          folderId: "folder-team-1111",
          folderName: "Team",
          mode: "folder",
        },
        written: 1,
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const listExitCode = await exportsCommand.run(
      makeContext({
        commandArgs: ["list"],
      }),
    );
    const rerunExitCode = await exportsCommand.run(
      makeContext({
        commandArgs: ["rerun", "notes-job-1"],
      }),
    );

    expect(listExitCode).toBe(0);
    expect(rerunExitCode).toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain("SCOPE");
    expect(log.mock.calls[0]?.[0]).toContain("folder Team");
    expect(log.mock.calls[1]?.[0]).toBe(
      "✓ Reran notes export job notes-job-2 from folder Team to /tmp/notes/_folders/folder-team-1111 (1/1 written)",
    );
  });

  test("auth command succeeds when any configured auth source is available", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      inspectAuth: vi.fn(async () => ({
        mode: "supabase-file",
        refreshAvailable: false,
        storedSessionAvailable: false,
        supabaseAvailable: true,
        supabasePath: "/tmp/supabase.json",
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await authCommand.run(
      makeContext({
        commandArgs: ["status"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith("Active source: supabase.json fallback");
    expect(log).toHaveBeenCalledWith("Recommended: No stored API key yet");
    expect(log).toHaveBeenCalledWith("API key: missing");
    expect(log).toHaveBeenCalledWith("Stored session: missing");
    expect(log).toHaveBeenCalledWith("Next step: granola auth login --api-key grn_...");
  });

  test("auth login forwards an API key to the app layer", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      loginAuth: vi.fn(async () => ({
        apiKeyAvailable: true,
        mode: "api-key",
        refreshAvailable: false,
        storedSessionAvailable: false,
        supabaseAvailable: false,
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await authCommand.run(
      makeContext({
        commandArgs: ["login"],
        commandFlags: {
          "api-key": "grn_test_123",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.loginAuth).toHaveBeenCalledWith({
      apiKey: "grn_test_123",
    });
    expect(log).toHaveBeenCalledWith("Stored Granola API key");
  });

  test("meeting command lists meetings inside a resolved folder", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      findFolder: vi.fn(async () => ({
        id: "folder-team-1111",
        name: "Team",
      })),
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      listMeetings: vi.fn(async () => ({
        meetings: [
          {
            createdAt: "2024-01-01T09:00:00Z",
            folders: [],
            id: "doc-alpha-1111",
            noteContentSource: "notes",
            tags: ["team"],
            title: "Alpha Sync",
            transcriptLoaded: true,
            transcriptSegmentCount: 1,
            updatedAt: "2024-01-03T10:00:00Z",
          },
        ],
        source: "live",
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await meetingCommand.run(
      makeContext({
        commandArgs: ["list"],
        commandFlags: {
          folder: "Team",
          search: "alpha",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.findFolder).toHaveBeenCalledWith("Team");
    expect(app.listMeetings).toHaveBeenCalledWith({
      folderId: "folder-team-1111",
      limit: 20,
      search: "alpha",
    });
    expect(log).toHaveBeenCalledWith("Folder: Team (folder-team-1111)");
    expect(log.mock.calls.at(-1)?.[0]).toContain("Alpha Sync");
  });

  test("serve command starts a server and reports security settings", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
    };
    const close = vi.fn(async () => {});
    const stopSyncLoop = vi.fn(async () => {});
    const startGranolaServer = vi.spyOn(serverModule, "startGranolaServer").mockResolvedValue({
      app: app as never,
      close,
      hostname: "0.0.0.0",
      port: 4096,
      server: {} as never,
      url: new URL("http://0.0.0.0:4096"),
    });
    const createGranolaSyncLoop = vi
      .spyOn(syncLoopModule, "createGranolaSyncLoop")
      .mockReturnValue({
        start: vi.fn(),
        stop: stopSyncLoop,
      });
    const waitForShutdown = vi
      .spyOn(sharedModule, "waitForShutdown")
      .mockImplementation(async (shutdown) => {
        await shutdown();
      });

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await serveCommand.run(
      makeContext({
        commandFlags: {
          network: "lan",
          password: "secret-pass",
          port: "4096",
          "trusted-origins": "https://app.example, https://admin.example",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(startGranolaServer).toHaveBeenCalledWith(app, {
      hostname: "0.0.0.0",
      port: 4096,
      runtime: {
        mode: "server",
        syncEnabled: true,
        syncIntervalMs: 60_000,
      },
      security: {
        password: "secret-pass",
        trustedOrigins: ["https://app.example", "https://admin.example"],
      },
    });
    expect(createGranolaSyncLoop).toHaveBeenCalledWith({
      app,
      intervalMs: 60_000,
      logger: console,
    });
    expect(waitForShutdown).toHaveBeenCalled();
    expect(stopSyncLoop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Server password protection: enabled");
    expect(log).toHaveBeenCalledWith("Background sync: enabled (60000ms)");
    expect(log).toHaveBeenCalledWith("Trusted origins: https://app.example, https://admin.example");
  });

  test("service start spawns the background process and reports the discovered URL", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(serviceModule, "discoverGranolaService").mockResolvedValue(undefined);
    vi.spyOn(serviceModule, "spawnGranolaServiceProcess").mockResolvedValue(4321);
    vi.spyOn(serviceModule, "waitForGranolaService").mockResolvedValue({
      kind: "running",
      record: {
        hostname: "127.0.0.1",
        logFile: "/tmp/service.log",
        passwordProtected: false,
        pid: 4321,
        port: 4123,
        protocolVersion: 2,
        startedAt: "2026-04-05T10:00:00.000Z",
        syncEnabled: true,
        syncIntervalMs: 60_000,
        url: "http://127.0.0.1:4123/",
      },
    });

    const exitCode = await serviceCommand.run(
      makeContext({
        commandArgs: ["start"],
        globalFlags: {
          config: "/tmp/.granola.toml",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(serviceModule.spawnGranolaServiceProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: ["--config", "/tmp/.granola.toml"],
      }),
    );
    expect(log).toHaveBeenCalledWith("Granola Toolkit service started on http://127.0.0.1:4123/");
    expect(log).toHaveBeenCalledWith("PID: 4321");
  });

  test("service stop terminates a running background process", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const processKill = vi.spyOn(process, "kill").mockImplementation(() => true);
    vi.spyOn(serviceModule, "inspectGranolaService").mockResolvedValue({
      kind: "running",
      record: {
        hostname: "127.0.0.1",
        logFile: "/tmp/service.log",
        passwordProtected: false,
        pid: 9876,
        port: 4123,
        protocolVersion: 2,
        startedAt: "2026-04-05T10:00:00.000Z",
        syncEnabled: true,
        syncIntervalMs: 60_000,
        url: "http://127.0.0.1:4123/",
      },
    });
    vi.spyOn(serviceModule, "isGranolaServiceProcessRunning").mockReturnValue(false);
    const removeRecord = vi
      .spyOn(serviceModule, "removeGranolaServiceRecord")
      .mockResolvedValue(undefined);

    const exitCode = await serviceCommand.run(
      makeContext({
        commandArgs: ["stop"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(processKill).toHaveBeenCalledWith(9876, "SIGTERM");
    expect(removeRecord).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Granola Toolkit service stopped.");
  });

  test("service stop force-stops an unreachable background process", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let running = true;
    const processKill = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
      if (signal === "SIGKILL") {
        running = false;
      }
      return true;
    });
    vi.spyOn(serviceModule, "inspectGranolaService").mockResolvedValue({
      kind: "unreachable",
      record: {
        hostname: "127.0.0.1",
        logFile: "/tmp/service.log",
        passwordProtected: false,
        pid: 9876,
        port: 4123,
        protocolVersion: 2,
        startedAt: "2026-04-05T10:00:00.000Z",
        syncEnabled: true,
        syncIntervalMs: 60_000,
        url: "http://127.0.0.1:4123/",
      },
    });
    vi.spyOn(serviceModule, "isGranolaServiceProcessRunning").mockImplementation(() => running);
    const removeRecord = vi
      .spyOn(serviceModule, "removeGranolaServiceRecord")
      .mockResolvedValue(undefined);

    const stopPromise = serviceCommand.run(
      makeContext({
        commandArgs: ["stop"],
      }),
    );
    await vi.advanceTimersByTimeAsync(10_500);
    await vi.advanceTimersByTimeAsync(500);
    const exitCode = await stopPromise;
    vi.useRealTimers();

    expect(exitCode).toBe(0);
    expect(processKill).toHaveBeenNthCalledWith(1, 9876, "SIGTERM");
    expect(processKill).toHaveBeenNthCalledWith(2, 9876, "SIGKILL");
    expect(removeRecord).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Granola Toolkit service force-stopped.");
  });

  test("sync command prints a structured sync summary", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      sync: vi.fn(async () => ({
        changes: [
          {
            kind: "created",
            meetingId: "doc-alpha-1111",
            title: "Alpha Sync",
            updatedAt: "2024-01-03T10:00:00Z",
          },
          {
            kind: "transcript-ready",
            meetingId: "doc-beta-2222",
            title: "Beta Review",
            updatedAt: "2024-01-04T10:00:00Z",
          },
        ],
        state: {
          filePath: "/tmp/sync-state.json",
          lastChanges: [],
          lastCompletedAt: "2024-03-01T12:00:00.000Z",
          running: false,
          summary: {
            changedCount: 1,
            createdCount: 1,
            folderCount: 2,
            meetingCount: 2,
            removedCount: 0,
            transcriptReadyCount: 1,
          },
        },
        summary: {
          changedCount: 1,
          createdCount: 1,
          folderCount: 2,
          meetingCount: 2,
          removedCount: 0,
          transcriptReadyCount: 1,
        },
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await syncCommand.run(makeContext());

    expect(exitCode).toBe(0);
    expect(app.sync).toHaveBeenCalledWith();
    expect(log).toHaveBeenCalledWith(
      "✓ Synced 2 meetings across 2 folders (1 created, 1 updated, 0 removed, 1 transcript ready)",
    );
    expect(log).toHaveBeenCalledWith("  created          Alpha Sync (doc-alpha-1111)");
    expect(log).toHaveBeenCalledWith("  transcript-ready Beta Review (doc-beta-2222)");
  });

  test("sync command starts the watch loop when requested", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      sync: vi.fn().mockResolvedValue({
        changes: [],
        state: {
          lastChanges: [],
          lastCompletedAt: "2024-03-01T12:00:00.000Z",
          running: false,
          summary: {
            changedCount: 0,
            createdCount: 0,
            folderCount: 0,
            meetingCount: 0,
            removedCount: 0,
            transcriptReadyCount: 0,
          },
        },
        summary: {
          changedCount: 0,
          createdCount: 0,
          folderCount: 0,
          meetingCount: 0,
          removedCount: 0,
          transcriptReadyCount: 0,
        },
      }),
    };
    const start = vi.fn();
    const stop = vi.fn(async () => {});

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);
    vi.spyOn(syncLoopModule, "createGranolaSyncLoop").mockReturnValue({ start, stop });
    vi.spyOn(sharedModule, "waitForShutdown").mockImplementation(async (shutdown) => {
      await shutdown();
    });

    const exitCode = await syncCommand.run(
      makeContext({
        commandFlags: {
          interval: "90s",
          watch: true,
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(start).toHaveBeenCalledWith({ immediate: false });
    expect(stop).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "Watching for Granola changes every 90000ms. Press Ctrl+C to stop.",
    );
  });

  test("sync events prints the recent event log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      listSyncEvents: vi.fn(async () => ({
        events: [
          {
            folders: [],
            id: "sync-1:1",
            kind: "meeting.created",
            meetingId: "doc-alpha-1111",
            occurredAt: "2024-03-01T12:00:00.000Z",
            runId: "sync-1",
            tags: ["team"],
            title: "Alpha Sync",
            transcriptLoaded: false,
            updatedAt: "2024-01-03T10:00:00Z",
          },
        ],
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await syncCommand.run(
      makeContext({
        commandArgs: ["events"],
        commandFlags: {
          limit: "10",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.listSyncEvents).toHaveBeenCalledWith({ limit: 10 });
    expect(log).toHaveBeenCalledWith(
      "2024-03-01T12:00:00.000Z meeting.created    Alpha Sync (doc-alpha-1111)",
    );
  });

  test("automation rules prints configured rule definitions", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      listAutomationRules: vi.fn(async () => ({
        rules: [
          {
            id: "team-transcript",
            name: "Team transcript ready",
            when: {
              eventKinds: ["transcript.ready"],
              folderNames: ["Team"],
              tags: ["customer"],
              transcriptLoaded: true,
            },
          },
        ],
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["rules"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.listAutomationRules).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("team-transcript"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("transcript.ready"));
  });

  test("automation runs prints recent action runs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      listAutomationRuns: vi.fn(async () => ({
        runs: [
          {
            actionId: "review",
            actionKind: "ask-user",
            actionName: "Review transcript",
            eventId: "sync-1:1",
            eventKind: "transcript.ready",
            folders: [],
            id: "sync-1:1:review",
            matchId: "sync-1:team-transcript",
            matchedAt: "2024-03-01T12:00:00.000Z",
            meetingId: "doc-alpha-1111",
            ruleId: "team-transcript",
            ruleName: "Team transcript ready",
            startedAt: "2024-03-01T12:00:00.000Z",
            status: "pending" as const,
            tags: ["team"],
            title: "Alpha Sync",
            transcriptLoaded: true,
          },
        ],
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["runs"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.listAutomationRuns).toHaveBeenCalledWith({ limit: 20, status: undefined });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Review transcript"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pending"));
  });

  test("automation artefacts prints generated pipeline artefacts", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      listAutomationArtefacts: vi.fn(async () => ({
        artefacts: [
          {
            actionId: "pipeline-notes",
            actionName: "Pipeline notes",
            attempts: [],
            createdAt: "2024-03-01T12:00:00.000Z",
            eventId: "sync-1",
            id: "notes:sync-1:team-transcript:pipeline-notes",
            kind: "notes" as const,
            matchId: "sync-1:team-transcript",
            meetingId: "doc-alpha-1111",
            model: "gpt-5-codex",
            parseMode: "json" as const,
            prompt: "Prompt",
            provider: "codex" as const,
            rawOutput: "{}",
            ruleId: "team-transcript",
            ruleName: "Team transcript ready",
            runId: "sync-1:team-transcript:pipeline-notes",
            status: "generated" as const,
            structured: {
              actionItems: [],
              decisions: [],
              followUps: [],
              highlights: [],
              markdown: "# Alpha",
              sections: [],
              summary: "Generated notes",
              title: "Alpha Sync Notes",
            },
            updatedAt: "2024-03-01T12:05:00.000Z",
          },
        ],
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["artefacts"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.listAutomationArtefacts).toHaveBeenCalledWith({
      kind: undefined,
      limit: 20,
      meetingId: undefined,
      status: undefined,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Alpha Sync Notes"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("generated"));
  });

  test("automation evaluate runs fixture-backed harness evaluations", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const cases = [
      {
        bundle: {
          document: {
            content: "",
            createdAt: "2024-01-01T09:00:00Z",
            id: "doc-alpha-1111",
            notesPlain: "Existing notes",
            tags: ["team"],
            title: "Alpha Sync",
            updatedAt: "2024-01-03T10:00:00Z",
          },
          meeting: {
            meeting: {
              createdAt: "2024-01-01T09:00:00Z",
              folders: [],
              id: "doc-alpha-1111",
              noteContentSource: "notes" as const,
              tags: ["team"],
              title: "Alpha Sync",
              transcriptLoaded: true,
              transcriptSegmentCount: 1,
              updatedAt: "2024-01-03T10:00:00Z",
            },
            note: {
              content: "Existing notes",
              contentSource: "notes" as const,
              createdAt: "2024-01-01T09:00:00Z",
              id: "doc-alpha-1111",
              tags: ["team"],
              title: "Alpha Sync",
              updatedAt: "2024-01-03T10:00:00Z",
            },
            noteMarkdown: "# Alpha Sync",
            roleHelpers: {
              ownerCandidates: [],
              participants: [],
              speakers: [],
            },
            transcript: null,
            transcriptText: "You: Hello team",
          },
        },
        id: "alpha-case",
        title: "Alpha Sync",
      },
    ];
    const app = {
      evaluateAutomationCases: vi.fn(async () => ({
        generatedAt: "2024-03-01T12:00:00Z",
        kind: "notes" as const,
        results: [
          {
            caseId: "alpha-case",
            caseTitle: "Alpha Sync",
            harnessId: "team-notes",
            harnessName: "Team notes",
            model: "gpt-5-codex",
            parseMode: "json" as const,
            prompt: "Prompt",
            provider: "codex" as const,
            rawOutput: "{}",
            status: "completed" as const,
            structured: {
              actionItems: [],
              decisions: [],
              followUps: [],
              highlights: [],
              markdown: "# Alpha",
              sections: [],
              summary: "Generated notes",
              title: "Alpha Sync Notes",
            },
          },
        ],
      })),
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);
    vi.spyOn(evaluationModule, "readAutomationEvaluationCases").mockResolvedValue(cases as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["evaluate"],
        commandFlags: {
          fixture: "/tmp/evaluations",
          harness: "team-notes",
          model: "openai/gpt-5-mini",
          provider: "openrouter",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(evaluationModule.readAutomationEvaluationCases).toHaveBeenCalledWith("/tmp/evaluations");
    expect(app.evaluateAutomationCases).toHaveBeenCalledWith(cases, {
      harnessIds: ["team-notes"],
      kind: "notes",
      model: "openai/gpt-5-mini",
      provider: "openrouter",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Evaluated 1 run(s) across 1 case(s)"),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Alpha Sync Notes"));
  });

  test("automation health prints recovery candidates", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      listProcessingIssues: vi.fn(async () => ({
        issues: [
          {
            detail: "The latest pipeline run failed",
            detectedAt: "2024-03-01T12:05:00.000Z",
            id: "pipeline-failed:doc-alpha-1111:team-transcript:pipeline-notes",
            kind: "pipeline-failed" as const,
            meetingId: "doc-alpha-1111",
            recoverable: true,
            ruleId: "team-transcript",
            severity: "error" as const,
            title: "Pipeline failed: Alpha Sync",
          },
        ],
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["health"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.listProcessingIssues).toHaveBeenCalledWith({
      limit: 20,
      meetingId: undefined,
      severity: undefined,
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pipeline-failed"));
  });

  test("automation approve resolves a pending run", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      resolveAutomationRun: vi.fn(async () => ({
        actionId: "review",
        actionKind: "ask-user",
        actionName: "Review transcript",
        eventId: "sync-1:1",
        eventKind: "transcript.ready",
        folders: [],
        id: "sync-1:1:review",
        matchId: "sync-1:team-transcript",
        matchedAt: "2024-03-01T12:00:00.000Z",
        meetingId: "doc-alpha-1111",
        result: "Approved from CLI",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        startedAt: "2024-03-01T12:00:00.000Z",
        status: "completed" as const,
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: true,
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["approve", "sync-1:1:review"],
        commandFlags: {
          note: "Approved from CLI",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.resolveAutomationRun).toHaveBeenCalledWith("sync-1:1:review", "approve", {
      note: "Approved from CLI",
    });
    expect(log).toHaveBeenCalledWith("Approved Review transcript for Alpha Sync (sync-1:1:review)");
  });

  test("automation recover re-runs a processing issue", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      recoverProcessingIssue: vi.fn(async () => ({
        issue: {
          detail: "The latest pipeline run failed",
          detectedAt: "2024-03-01T12:05:00.000Z",
          id: "pipeline-failed:doc-alpha-1111:team-transcript:pipeline-notes",
          kind: "pipeline-failed" as const,
          meetingId: "doc-alpha-1111",
          recoverable: true,
          ruleId: "team-transcript",
          severity: "error" as const,
          title: "Pipeline failed: Alpha Sync",
        },
        recoveredAt: "2024-03-01T12:10:00.000Z",
        runCount: 1,
        syncRan: false,
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["recover", "pipeline-failed:doc-alpha-1111:team-transcript:pipeline-notes"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.recoverProcessingIssue).toHaveBeenCalledWith(
      "pipeline-failed:doc-alpha-1111:team-transcript:pipeline-notes",
    );
    expect(log).toHaveBeenCalledWith(
      "Recovered pipeline-failed for Pipeline failed: Alpha Sync (pipeline-failed:doc-alpha-1111:team-transcript:pipeline-notes)",
    );
  });

  test("automation approve-artefact resolves a generated artefact", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      resolveAutomationArtefact: vi.fn(async () => ({
        actionId: "pipeline-notes",
        actionName: "Pipeline notes",
        attempts: [],
        createdAt: "2024-03-01T12:00:00.000Z",
        eventId: "sync-1",
        history: [
          {
            action: "generated" as const,
            at: "2024-03-01T12:00:00.000Z",
          },
          {
            action: "approved" as const,
            at: "2024-03-01T12:01:00.000Z",
            note: "Looks good",
          },
        ],
        id: "notes:sync-1:team-transcript:pipeline-notes",
        kind: "notes" as const,
        matchId: "sync-1:team-transcript",
        meetingId: "doc-alpha-1111",
        model: "gpt-5-codex",
        parseMode: "json" as const,
        prompt: "Prompt",
        provider: "codex" as const,
        rawOutput: "{}",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        runId: "sync-1:team-transcript:pipeline-notes",
        status: "approved" as const,
        structured: {
          actionItems: [],
          decisions: [],
          followUps: [],
          highlights: [],
          markdown: "# Alpha",
          sections: [],
          summary: "Generated notes",
          title: "Alpha Sync Notes",
        },
        updatedAt: "2024-03-01T12:01:00.000Z",
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["approve-artefact", "notes:sync-1:team-transcript:pipeline-notes"],
        commandFlags: {
          note: "Looks good",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.resolveAutomationArtefact).toHaveBeenCalledWith(
      "notes:sync-1:team-transcript:pipeline-notes",
      "approve",
      {
        note: "Looks good",
      },
    );
    expect(log).toHaveBeenCalledWith(
      "Approved artefact Alpha Sync Notes (notes:sync-1:team-transcript:pipeline-notes)",
    );
  });

  test("automation rerun replays an artefact pipeline", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
      rerunAutomationArtefact: vi.fn(async () => ({
        actionId: "pipeline-notes",
        actionName: "Pipeline notes",
        attempts: [],
        createdAt: "2024-03-01T12:05:00.000Z",
        eventId: "sync-1",
        id: "notes:sync-1:team-transcript:pipeline-notes:rerun",
        kind: "notes" as const,
        matchId: "sync-1:team-transcript",
        meetingId: "doc-alpha-1111",
        model: "gpt-5-codex",
        parseMode: "json" as const,
        prompt: "Prompt",
        provider: "codex" as const,
        rawOutput: "{}",
        rerunOfId: "notes:sync-1:team-transcript:pipeline-notes",
        ruleId: "team-transcript",
        ruleName: "Team transcript ready",
        runId: "sync-1:team-transcript:pipeline-notes:rerun",
        status: "generated" as const,
        structured: {
          actionItems: [],
          decisions: [],
          followUps: [],
          highlights: [],
          markdown: "# Alpha",
          sections: [],
          summary: "Generated notes",
          title: "Alpha Sync Notes",
        },
        updatedAt: "2024-03-01T12:05:00.000Z",
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await automationCommand.run(
      makeContext({
        commandArgs: ["rerun", "notes:sync-1:team-transcript:pipeline-notes"],
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.rerunAutomationArtefact).toHaveBeenCalledWith(
      "notes:sync-1:team-transcript:pipeline-notes",
    );
    expect(log).toHaveBeenCalledWith(
      "Re-ran notes pipeline for Alpha Sync Notes (notes:sync-1:team-transcript:pipeline-notes:rerun)",
    );
  });

  test("search command uses the local index-backed meeting search flow", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {
      findFolder: vi.fn(async () => ({
        id: "folder-team-1111",
        name: "Team",
      })),
      getState: () => ({
        auth: {
          mode: "api-key",
        },
      }),
      listMeetings: vi.fn(async () => ({
        meetings: [
          {
            createdAt: "2024-01-01T09:00:00Z",
            folders: [],
            id: "doc-alpha-1111",
            noteContentSource: "notes",
            tags: ["team", "customer"],
            title: "Alpha Sync",
            transcriptLoaded: true,
            transcriptSegmentCount: 1,
            updatedAt: "2024-01-03T10:00:00Z",
          },
        ],
        source: "index" as const,
      })),
    };

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);

    const exitCode = await searchCommand.run(
      makeContext({
        commandArgs: ["customer", "onboarding"],
        commandFlags: {
          folder: "Team",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(app.findFolder).toHaveBeenCalledWith("Team");
    expect(app.listMeetings).toHaveBeenCalledWith({
      folderId: "folder-team-1111",
      limit: 20,
      preferIndex: true,
      search: "customer onboarding",
    });
    expect(log).toHaveBeenCalledWith("Searched the local index");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Alpha Sync"));
  });

  test("tui command reuses the background sync loop and stops it on exit", async () => {
    const app = {
      getState: () => ({
        auth: {
          mode: "stored-session",
        },
      }),
    };
    const start = vi.fn();
    const stop = vi.fn(async () => {});
    const runGranolaTui = vi
      .spyOn(tuiWorkspaceModule, "runGranolaTui")
      .mockImplementation(async (_app, options = {}) => {
        await options.onClose?.();
        return 0;
      });

    vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    vi.spyOn(appModule, "createGranolaApp").mockResolvedValue(app as never);
    vi.spyOn(syncLoopModule, "createGranolaSyncLoop").mockReturnValue({ start, stop });

    const exitCode = await tuiCommand.run(
      makeContext({
        commandFlags: {
          meeting: "doc-alpha-1111",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(start).toHaveBeenCalledWith();
    expect(stop).toHaveBeenCalled();
    expect(runGranolaTui).toHaveBeenCalledWith(app, {
      initialMeetingId: "doc-alpha-1111",
      onClose: expect.any(Function),
    });
  });

  test("attach command discovers the background service when no URL is provided", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = {} as never;
    vi.spyOn(serviceModule, "discoverGranolaService").mockResolvedValue({
      hostname: "127.0.0.1",
      logFile: "/tmp/service.log",
      passwordProtected: false,
      pid: 1111,
      port: 4123,
      protocolVersion: 2,
      startedAt: "2026-04-05T10:00:00.000Z",
      syncEnabled: true,
      syncIntervalMs: 60_000,
      url: "http://127.0.0.1:4123/",
    });
    vi.spyOn(serverClientModule, "createGranolaServerClient").mockResolvedValue(app);
    const runGranolaTui = vi.spyOn(tuiWorkspaceModule, "runGranolaTui").mockResolvedValue(0);

    const exitCode = await attachCommand.run(
      makeContext({
        commandFlags: {
          meeting: "doc-alpha-1111",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(serverClientModule.createGranolaServerClient).toHaveBeenCalledWith(
      "http://127.0.0.1:4123/",
      {
        password: undefined,
      },
    );
    expect(runGranolaTui).toHaveBeenCalledWith(app, {
      initialMeetingId: "doc-alpha-1111",
    });
    expect(log).toHaveBeenCalledWith("Attaching to http://127.0.0.1:4123/");
  });

  test("web command reuses an existing background service when no runtime overrides are passed", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const openExternalUrl = vi.spyOn(browserModule, "openExternalUrl").mockResolvedValue();
    vi.spyOn(serviceModule, "discoverGranolaService").mockResolvedValue({
      hostname: "127.0.0.1",
      logFile: "/tmp/service.log",
      passwordProtected: false,
      pid: 1111,
      port: 4123,
      protocolVersion: 2,
      startedAt: "2026-04-05T10:00:00.000Z",
      syncEnabled: true,
      syncIntervalMs: 60_000,
      url: "http://127.0.0.1:4123/",
    });
    const loadConfig = vi.spyOn(configModule, "loadConfig");
    const createGranolaApp = vi.spyOn(appModule, "createGranolaApp");

    const exitCode = await webCommand.run(
      makeContext({
        commandFlags: {
          meeting: "doc-alpha-1111",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(loadConfig).not.toHaveBeenCalled();
    expect(createGranolaApp).not.toHaveBeenCalled();
    expect(openExternalUrl).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:4123/?meeting=doc-alpha-1111"),
    );
    expect(log).toHaveBeenCalledWith(
      "Granola Toolkit web workspace already running on http://127.0.0.1:4123/",
    );
  });

  test("web command starts the background service when safe and none is running", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const openExternalUrl = vi.spyOn(browserModule, "openExternalUrl").mockResolvedValue();
    const loadConfig = vi.spyOn(configModule, "loadConfig").mockResolvedValue(makeConfig());
    const createGranolaApp = vi.spyOn(appModule, "createGranolaApp");
    vi.spyOn(serviceModule, "discoverGranolaService").mockResolvedValue(undefined);
    vi.spyOn(serviceModule, "spawnGranolaServiceProcess").mockResolvedValue(2222);
    vi.spyOn(serviceModule, "waitForGranolaService").mockResolvedValue({
      info: {
        capabilities: {
          attach: true,
          auth: true,
          automation: true,
          events: true,
          exports: true,
          folders: true,
          meetingOpen: true,
          processing: true,
          sync: true,
          webClient: true,
        },
        persistence: {
          exportJobs: true,
          meetingIndex: true,
          sessionStore: "file",
          syncEvents: true,
          syncState: true,
        },
        product: "granola-toolkit",
        protocolVersion: 2,
        runtime: {
          mode: "background-service",
          syncEnabled: true,
          syncIntervalMs: 60_000,
        },
        transport: "local-http",
      },
      kind: "running",
      record: {
        hostname: "127.0.0.1",
        logFile: "/tmp/service.log",
        passwordProtected: false,
        pid: 2222,
        port: 4123,
        protocolVersion: 2,
        startedAt: "2026-04-05T10:00:00.000Z",
        syncEnabled: true,
        syncIntervalMs: 60_000,
        url: "http://127.0.0.1:4123/",
      },
    });

    const exitCode = await webCommand.run(
      makeContext({
        commandFlags: {
          meeting: "doc-alpha-1111",
        },
      }),
    );

    expect(exitCode).toBe(0);
    expect(loadConfig).toHaveBeenCalled();
    expect(createGranolaApp).not.toHaveBeenCalled();
    expect(serviceModule.spawnGranolaServiceProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: [],
        env: expect.any(Object),
        logFile: expect.any(String),
      }),
    );
    expect(openExternalUrl).toHaveBeenCalledWith(
      new URL("http://127.0.0.1:4123/?meeting=doc-alpha-1111"),
    );
    expect(log).toHaveBeenCalledWith(
      "Granola Toolkit background service started on http://127.0.0.1:4123/",
    );
  });
});
