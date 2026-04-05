import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test, vi } from "vite-plus/test";

import {
  inspectGranolaService,
  readGranolaServiceRecord,
  spawnGranolaServiceProcess,
  writeGranolaServiceRecord,
} from "../src/service.ts";
import { GRANOLA_TRANSPORT_PROTOCOL_VERSION } from "../src/transport.ts";

function createServerInfo() {
  return {
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
      sessionStore: "file" as const,
      syncEvents: true,
      syncState: true,
    },
    product: "granola-toolkit" as const,
    protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
    transport: "local-http" as const,
  };
}

describe("service discovery", () => {
  test("reports a running service when metadata and health check succeed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "granola-toolkit-service-"));
    const serviceStateFile = join(directory, "service.json");
    await writeGranolaServiceRecord(
      {
        hostname: "127.0.0.1",
        logFile: join(directory, "service.log"),
        passwordProtected: false,
        pid: 1234,
        port: 4123,
        protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
        startedAt: "2026-04-05T10:00:00.000Z",
        syncEnabled: true,
        syncIntervalMs: 60_000,
        url: "http://127.0.0.1:4123/",
      },
      serviceStateFile,
    );

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(createServerInfo())));
    const status = await inspectGranolaService({
      fetchImpl: fetchImpl as typeof fetch,
      isProcessRunning: () => true,
      serviceStateFile,
    });

    expect(status.kind).toBe("running");
    expect(status.record?.url).toBe("http://127.0.0.1:4123/");
    expect(fetchImpl).toHaveBeenCalled();
  });

  test("cleans up stale metadata when the service process is gone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "granola-toolkit-service-"));
    const serviceStateFile = join(directory, "service.json");
    await writeGranolaServiceRecord(
      {
        hostname: "127.0.0.1",
        logFile: join(directory, "service.log"),
        passwordProtected: true,
        pid: 4567,
        port: 4123,
        protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
        startedAt: "2026-04-05T10:00:00.000Z",
        syncEnabled: true,
        syncIntervalMs: 60_000,
        url: "http://127.0.0.1:4123/",
      },
      serviceStateFile,
    );

    const status = await inspectGranolaService({
      isProcessRunning: () => false,
      serviceStateFile,
    });

    expect(status.kind).toBe("stale");
    await expect(readGranolaServiceRecord(serviceStateFile)).resolves.toBeUndefined();
  });
});

describe("spawnGranolaServiceProcess", () => {
  test("spawns a detached service run command and logs to the service log", async () => {
    const directory = await mkdtemp(join(tmpdir(), "granola-toolkit-service-"));
    const logFile = join(directory, "service.log");
    const unref = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({
      pid: 9999,
      unref,
    });

    const pid = await spawnGranolaServiceProcess({
      cliInvocation: {
        args: ["/tmp/dist/cli.js"],
        file: "/usr/local/bin/node",
      },
      commandArgs: ["--port", "4123", "--debug"],
      cwd: "/tmp/workspace",
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
      logFile,
      spawnImpl: spawnImpl as never,
    });

    expect(pid).toBe(9999);
    expect(spawnImpl).toHaveBeenCalledWith(
      "/usr/local/bin/node",
      ["/tmp/dist/cli.js", "service", "run", "--port", "4123", "--debug"],
      expect.objectContaining({
        cwd: "/tmp/workspace",
        detached: true,
        env: {
          PATH: process.env.PATH,
        },
        stdio: ["ignore", expect.any(Number), expect.any(Number)],
      }),
    );
    expect(unref).toHaveBeenCalled();
  });
});
