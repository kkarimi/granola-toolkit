import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { asRecord, parseJsonString } from "./utils.ts";

export interface GranolaPluginSettings {
  automationEnabled: boolean;
}

interface GranolaPluginSettingsFile {
  automationEnabled?: boolean;
}

function normalisePluginSettings(value: unknown): GranolaPluginSettings {
  const record = asRecord(value) as GranolaPluginSettingsFile | undefined;
  return {
    automationEnabled: record?.automationEnabled === true,
  };
}

export interface PluginSettingsStore {
  readSettings(): Promise<GranolaPluginSettings>;
  writeSettings(settings: GranolaPluginSettings): Promise<void>;
}

export class MemoryPluginSettingsStore implements PluginSettingsStore {
  #settings: GranolaPluginSettings;

  constructor(settings: Partial<GranolaPluginSettings> = {}) {
    this.#settings = {
      automationEnabled: settings.automationEnabled === true,
    };
  }

  async readSettings(): Promise<GranolaPluginSettings> {
    return { ...this.#settings };
  }

  async writeSettings(settings: GranolaPluginSettings): Promise<void> {
    this.#settings = {
      automationEnabled: settings.automationEnabled === true,
    };
  }
}

export class FilePluginSettingsStore implements PluginSettingsStore {
  constructor(private readonly filePath: string = defaultPluginsFilePath()) {}

  async readSettings(): Promise<GranolaPluginSettings> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return normalisePluginSettings(parseJsonString(contents));
    } catch {
      return {
        automationEnabled: false,
      };
    }
  }

  async writeSettings(settings: GranolaPluginSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  }
}

export function defaultPluginsFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().pluginsFile;
}

export function createDefaultPluginSettingsStore(filePath?: string): PluginSettingsStore {
  return new FilePluginSettingsStore(filePath);
}
