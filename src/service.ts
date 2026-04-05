import { closeSync, openSync } from "node:fs";
import { access, readFile, rm } from "node:fs/promises";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import {
  granolaTransportPaths,
  GRANOLA_TRANSPORT_PROTOCOL_VERSION,
  type GranolaServerInfo,
} from "./transport.ts";
import { readUtf8, writeTextFile } from "./utils.ts";

export interface GranolaServiceRecord {
  hostname: string;
  logFile: string;
  passwordProtected: boolean;
  pid: number;
  port: number;
  protocolVersion: number;
  startedAt: string;
  syncEnabled: boolean;
  syncIntervalMs: number;
  url: string;
}

export type GranolaServiceStatusKind = "invalid" | "missing" | "running" | "stale" | "unreachable";

export interface GranolaServiceStatus {
  error?: Error;
  info?: GranolaServerInfo;
  kind: GranolaServiceStatusKind;
  record?: GranolaServiceRecord;
}

export interface GranolaCliInvocation {
  args: string[];
  file: string;
}

interface InspectGranolaServiceOptions {
  cleanupStale?: boolean;
  fetchImpl?: typeof fetch;
  isProcessRunning?: (pid: number) => boolean;
  serviceStateFile?: string;
  timeoutMs?: number;
}

interface WaitForGranolaServiceOptions extends InspectGranolaServiceOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

interface SpawnGranolaServiceProcessOptions {
  cliInvocation?: GranolaCliInvocation;
  commandArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logFile?: string;
  spawnImpl?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

function defaultServiceStateFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().serviceStateFile;
}

function defaultServiceLogFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().serviceLogFile;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (timeoutMs <= 0 || typeof AbortSignal.timeout !== "function") {
    return undefined;
  }

  return AbortSignal.timeout(timeoutMs);
}

function parseServiceRecord(value: unknown): GranolaServiceRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<GranolaServiceRecord>;
  if (
    typeof candidate.hostname !== "string" ||
    typeof candidate.logFile !== "string" ||
    typeof candidate.passwordProtected !== "boolean" ||
    typeof candidate.pid !== "number" ||
    typeof candidate.port !== "number" ||
    typeof candidate.protocolVersion !== "number" ||
    typeof candidate.startedAt !== "string" ||
    typeof candidate.syncEnabled !== "boolean" ||
    typeof candidate.syncIntervalMs !== "number" ||
    typeof candidate.url !== "string"
  ) {
    return undefined;
  }

  return candidate as GranolaServiceRecord;
}

async function fetchServerInfo(
  serviceUrl: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<GranolaServerInfo> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(new URL(granolaTransportPaths.serverInfo, serviceUrl), {
    headers: {
      accept: "application/json",
    },
    signal: createTimeoutSignal(options.timeoutMs ?? 1_500),
  });
  if (!response.ok) {
    throw new Error(`service responded with ${response.status} ${response.statusText}`.trim());
  }

  const info = (await response.json()) as GranolaServerInfo;
  if (
    info.product !== "granola-toolkit" ||
    info.protocolVersion !== GRANOLA_TRANSPORT_PROTOCOL_VERSION
  ) {
    throw new Error("service metadata did not match the expected Granola Toolkit protocol");
  }

  return info;
}

export function currentGranolaCliInvocation(
  argv: string[] = process.argv,
  execPath = process.execPath,
): GranolaCliInvocation {
  const entrypoint = argv[1];
  const usesScriptEntrypoint =
    typeof entrypoint === "string" && /\.(?:[cm]?js|mjs|cjs|ts)$/.test(entrypoint);

  return {
    args: usesScriptEntrypoint ? [entrypoint] : [],
    file: execPath,
  };
}

export function defaultGranolaServiceRecord(): {
  logFile: string;
  serviceStateFile: string;
} {
  return {
    logFile: defaultServiceLogFilePath(),
    serviceStateFile: defaultServiceStateFilePath(),
  };
}

export function isGranolaServiceProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "EPERM"
    ) {
      return true;
    }

    return false;
  }
}

export async function readGranolaServiceRecord(
  serviceStateFile = defaultServiceStateFilePath(),
): Promise<GranolaServiceRecord | undefined> {
  try {
    const raw = await readUtf8(serviceStateFile);
    return parseServiceRecord(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export async function writeGranolaServiceRecord(
  record: GranolaServiceRecord,
  serviceStateFile = defaultServiceStateFilePath(),
): Promise<void> {
  await writeTextFile(serviceStateFile, `${JSON.stringify(record, null, 2)}\n`);
}

export async function removeGranolaServiceRecord(
  serviceStateFile = defaultServiceStateFilePath(),
): Promise<void> {
  await rm(serviceStateFile, { force: true });
}

export async function inspectGranolaService(
  options: InspectGranolaServiceOptions = {},
): Promise<GranolaServiceStatus> {
  const record = await readGranolaServiceRecord(options.serviceStateFile);
  if (!record) {
    return { kind: "missing" };
  }

  const isProcessRunning = options.isProcessRunning ?? isGranolaServiceProcessRunning;
  if (!isProcessRunning(record.pid)) {
    if (options.cleanupStale !== false) {
      await removeGranolaServiceRecord(options.serviceStateFile);
    }

    return { kind: "stale", record };
  }

  try {
    const info = await fetchServerInfo(record.url, {
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });
    return {
      info,
      kind: "running",
      record,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      kind: "unreachable",
      record,
    };
  }
}

export async function discoverGranolaService(
  options: InspectGranolaServiceOptions = {},
): Promise<GranolaServiceRecord | undefined> {
  const status = await inspectGranolaService(options);
  return status.kind === "running" ? status.record : undefined;
}

export async function waitForGranolaService(
  options: WaitForGranolaServiceOptions = {},
): Promise<GranolaServiceStatus> {
  const intervalMs = Math.max(100, options.intervalMs ?? 200);
  const timeoutMs = Math.max(intervalMs, options.timeoutMs ?? 10_000);
  const startedAt = Date.now();
  let lastStatus: GranolaServiceStatus = { kind: "missing" };

  while (Date.now() - startedAt <= timeoutMs) {
    lastStatus = await inspectGranolaService({
      cleanupStale: false,
      fetchImpl: options.fetchImpl,
      isProcessRunning: options.isProcessRunning,
      serviceStateFile: options.serviceStateFile,
      timeoutMs: options.timeoutMs,
    });
    if (lastStatus.kind === "running") {
      return lastStatus;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  return lastStatus;
}

export async function readGranolaServiceLogTail(
  options: {
    bytes?: number;
    logFile?: string;
  } = {},
): Promise<string | undefined> {
  const logFile = options.logFile ?? defaultServiceLogFilePath();

  try {
    await access(logFile);
  } catch {
    return undefined;
  }

  const raw = await readFile(logFile, "utf8");
  const byteLimit = Math.max(256, options.bytes ?? 4_000);
  return raw.slice(-byteLimit).trim() || undefined;
}

export async function spawnGranolaServiceProcess(
  options: SpawnGranolaServiceProcessOptions = {},
): Promise<number> {
  const cliInvocation = options.cliInvocation ?? currentGranolaCliInvocation();
  const logFile = options.logFile ?? defaultServiceLogFilePath();
  const stdoutFd = openSync(logFile, "a");
  const spawnImpl = options.spawnImpl ?? spawn;

  try {
    const child = spawnImpl(
      cliInvocation.file,
      [...cliInvocation.args, "service", "run", ...(options.commandArgs ?? [])],
      {
        cwd: options.cwd ?? process.cwd(),
        detached: true,
        env: options.env ?? process.env,
        stdio: ["ignore", stdoutFd, stdoutFd],
      },
    );

    child.unref();
    return child.pid ?? 0;
  } finally {
    closeSync(stdoutFd);
  }
}
