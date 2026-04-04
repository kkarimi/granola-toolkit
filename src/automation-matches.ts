import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { GranolaAutomationMatch } from "./app/index.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { parseJsonString } from "./utils.ts";

function cloneMatch(match: GranolaAutomationMatch): GranolaAutomationMatch {
  return {
    ...match,
    folders: match.folders.map((folder) => ({ ...folder })),
    tags: [...match.tags],
  };
}

export interface AutomationMatchStore {
  appendMatches(matches: GranolaAutomationMatch[]): Promise<void>;
  readMatches(limit?: number): Promise<GranolaAutomationMatch[]>;
}

export class MemoryAutomationMatchStore implements AutomationMatchStore {
  #matches: GranolaAutomationMatch[] = [];

  async appendMatches(matches: GranolaAutomationMatch[]): Promise<void> {
    this.#matches.push(...matches.map(cloneMatch));
  }

  async readMatches(limit = 50): Promise<GranolaAutomationMatch[]> {
    const values = limit > 0 ? this.#matches.slice(-limit) : this.#matches;
    return values.reverse().map(cloneMatch);
  }
}

export class FileAutomationMatchStore implements AutomationMatchStore {
  constructor(private readonly filePath: string = defaultAutomationMatchesFilePath()) {}

  async appendMatches(matches: GranolaAutomationMatch[]): Promise<void> {
    if (matches.length === 0) {
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    const payload = matches.map((match) => JSON.stringify(match)).join("\n");
    await appendFile(this.filePath, `${payload}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async readMatches(limit = 50): Promise<GranolaAutomationMatch[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const matches = contents
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parseJsonString<GranolaAutomationMatch>(line))
        .filter((match): match is GranolaAutomationMatch => Boolean(match))
        .map(cloneMatch);

      const values = limit > 0 ? matches.slice(-limit) : matches;
      return values.reverse();
    } catch {
      return [];
    }
  }
}

export function defaultAutomationMatchesFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().automationMatchesFile;
}

export function createDefaultAutomationMatchStore(filePath?: string): AutomationMatchStore {
  return new FileAutomationMatchStore(filePath);
}
