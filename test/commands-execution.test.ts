import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { AppConfig } from "../src/types.ts";
import type { CommandContext } from "../src/commands/types.ts";
import { authCommand } from "../src/commands/auth.ts";
import { exportsCommand } from "../src/commands/exports.ts";
import { meetingCommand } from "../src/commands/meeting.ts";
import { notesCommand } from "../src/commands/notes.ts";
import { serveCommand } from "../src/commands/serve.ts";
import { transcriptsCommand } from "../src/commands/transcripts.ts";
import * as appModule from "../src/app/index.ts";
import * as configModule from "../src/config.ts";
import * as serverModule from "../src/server/http.ts";
import * as sharedModule from "../src/commands/shared.ts";

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

  test("auth command returns a failing exit code when no stored session is available", async () => {
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

    expect(exitCode).toBe(1);
    expect(log).toHaveBeenCalledWith("Active source: supabase.json");
    expect(log).toHaveBeenCalledWith("Stored session: missing");
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
    const startGranolaServer = vi.spyOn(serverModule, "startGranolaServer").mockResolvedValue({
      app: app as never,
      close,
      hostname: "0.0.0.0",
      port: 4096,
      server: {} as never,
      url: new URL("http://0.0.0.0:4096"),
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
      security: {
        password: "secret-pass",
        trustedOrigins: ["https://app.example", "https://admin.example"],
      },
    });
    expect(waitForShutdown).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Server password protection: enabled");
    expect(log).toHaveBeenCalledWith("Trusted origins: https://app.example, https://admin.example");
  });
});
