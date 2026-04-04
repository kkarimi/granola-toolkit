import { randomUUID } from "node:crypto";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { GranolaAppExportJobState } from "./app/types.ts";
import { asRecord, parseJsonString, stringValue } from "./utils.ts";

const EXPORT_JOBS_VERSION = 1;
const MAX_EXPORT_JOBS = 100;

interface ExportJobsFile {
  jobs: GranolaAppExportJobState[];
  version: number;
}

export interface ExportJobStore {
  readJobs(): Promise<GranolaAppExportJobState[]>;
  writeJobs(jobs: GranolaAppExportJobState[]): Promise<void>;
}

function normaliseJob(value: unknown): GranolaAppExportJobState | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = stringValue(record.id);
  const kind = stringValue(record.kind);
  const status = stringValue(record.status);
  const format = stringValue(record.format);
  const outputDir = stringValue(record.outputDir);
  const startedAt = stringValue(record.startedAt);
  const itemCount =
    typeof record.itemCount === "number" && Number.isFinite(record.itemCount)
      ? record.itemCount
      : 0;
  const written =
    typeof record.written === "number" && Number.isFinite(record.written) ? record.written : 0;
  const completedCount =
    typeof record.completedCount === "number" && Number.isFinite(record.completedCount)
      ? record.completedCount
      : written;

  if (
    !id ||
    !format ||
    !outputDir ||
    !startedAt ||
    (kind !== "notes" && kind !== "transcripts") ||
    (status !== "running" && status !== "completed" && status !== "failed")
  ) {
    return undefined;
  }

  return {
    completedCount,
    error: stringValue(record.error) || undefined,
    finishedAt: stringValue(record.finishedAt) || undefined,
    format,
    id,
    itemCount,
    kind,
    outputDir,
    startedAt,
    status,
    written,
  };
}

function normaliseJobsFile(parsed: unknown): ExportJobsFile {
  const record = asRecord(parsed);
  if (!record || record.version !== EXPORT_JOBS_VERSION || !Array.isArray(record.jobs)) {
    return {
      jobs: [],
      version: EXPORT_JOBS_VERSION,
    };
  }

  return {
    jobs: record.jobs
      .map((job) => normaliseJob(job))
      .filter((job): job is GranolaAppExportJobState => Boolean(job))
      .slice(0, MAX_EXPORT_JOBS),
    version: EXPORT_JOBS_VERSION,
  };
}

export function createExportJobId(kind: "notes" | "transcripts"): string {
  return `${kind}-${randomUUID()}`;
}

export function defaultExportJobsFilePath(): string {
  const home = homedir();
  return platform() === "darwin"
    ? join(home, "Library", "Application Support", "granola-toolkit", "export-jobs.json")
    : join(home, ".config", "granola-toolkit", "export-jobs.json");
}

export class FileExportJobStore implements ExportJobStore {
  constructor(private readonly filePath: string = defaultExportJobsFilePath()) {}

  async readJobs(): Promise<GranolaAppExportJobState[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<unknown>(raw);
      return normaliseJobsFile(parsed).jobs;
    } catch {
      return [];
    }
  }

  async writeJobs(jobs: GranolaAppExportJobState[]): Promise<void> {
    const payload: ExportJobsFile = {
      jobs: jobs.slice(0, MAX_EXPORT_JOBS),
      version: EXPORT_JOBS_VERSION,
    };

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export class MemoryExportJobStore implements ExportJobStore {
  #jobs: GranolaAppExportJobState[] = [];

  async readJobs(): Promise<GranolaAppExportJobState[]> {
    return this.#jobs.map((job) => ({ ...job }));
  }

  async writeJobs(jobs: GranolaAppExportJobState[]): Promise<void> {
    this.#jobs = jobs.map((job) => ({ ...job }));
  }
}

export function createDefaultExportJobStore(): ExportJobStore {
  return new FileExportJobStore();
}
