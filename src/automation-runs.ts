import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { GranolaAutomationActionRun, GranolaAutomationActionRunStatus } from "./app/index.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { parseJsonString } from "./utils.ts";

function cloneRun(run: GranolaAutomationActionRun): GranolaAutomationActionRun {
  return {
    ...run,
    folders: run.folders.map((folder) => ({ ...folder })),
    meta: run.meta ? structuredClone(run.meta) : undefined,
    tags: [...run.tags],
  };
}

function sortRuns(runs: GranolaAutomationActionRun[]): GranolaAutomationActionRun[] {
  return runs
    .slice()
    .sort((left, right) =>
      (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt),
    );
}

function mergeRuns(runs: GranolaAutomationActionRun[]): GranolaAutomationActionRun[] {
  const byId = new Map<string, GranolaAutomationActionRun>();
  for (const run of runs) {
    byId.set(run.id, cloneRun(run));
  }

  return sortRuns([...byId.values()]);
}

export interface AutomationRunStore {
  appendRuns(runs: GranolaAutomationActionRun[]): Promise<void>;
  readRun(id: string): Promise<GranolaAutomationActionRun | undefined>;
  readRuns(options?: {
    limit?: number;
    status?: GranolaAutomationActionRunStatus;
  }): Promise<GranolaAutomationActionRun[]>;
}

export class MemoryAutomationRunStore implements AutomationRunStore {
  #runs: GranolaAutomationActionRun[] = [];

  async appendRuns(runs: GranolaAutomationActionRun[]): Promise<void> {
    this.#runs.push(...runs.map(cloneRun));
  }

  async readRun(id: string): Promise<GranolaAutomationActionRun | undefined> {
    return mergeRuns(this.#runs).find((run) => run.id === id);
  }

  async readRuns(
    options: {
      limit?: number;
      status?: GranolaAutomationActionRunStatus;
    } = {},
  ): Promise<GranolaAutomationActionRun[]> {
    const runs = mergeRuns(this.#runs).filter((run) =>
      options.status ? run.status === options.status : true,
    );
    const limited = options.limit && options.limit > 0 ? runs.slice(0, options.limit) : runs;
    return limited.map(cloneRun);
  }
}

export class FileAutomationRunStore implements AutomationRunStore {
  constructor(private readonly filePath: string = defaultAutomationRunsFilePath()) {}

  async appendRuns(runs: GranolaAutomationActionRun[]): Promise<void> {
    if (runs.length === 0) {
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = runs.map((run) => JSON.stringify(run)).join("\n");
    await appendFile(this.filePath, `${payload}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async readRun(id: string): Promise<GranolaAutomationActionRun | undefined> {
    return (await this.readRuns({ limit: 0 })).find((run) => run.id === id);
  }

  async readRuns(
    options: {
      limit?: number;
      status?: GranolaAutomationActionRunStatus;
    } = {},
  ): Promise<GranolaAutomationActionRun[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const runs = mergeRuns(
        contents
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => parseJsonString<GranolaAutomationActionRun>(line))
          .filter((run): run is GranolaAutomationActionRun => Boolean(run)),
      ).filter((run) => (options.status ? run.status === options.status : true));

      const limited = options.limit && options.limit > 0 ? runs.slice(0, options.limit) : runs;
      return limited.map(cloneRun);
    } catch {
      return [];
    }
  }
}

export function defaultAutomationRunsFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().automationRunsFile;
}

export function createDefaultAutomationRunStore(filePath?: string): AutomationRunStore {
  return new FileAutomationRunStore(filePath);
}
