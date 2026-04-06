import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { GranolaPluginDefinition } from "./plugin-registry.ts";
import { defaultPluginDefinitions, defaultPluginEnabledMap } from "./plugin-registry.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { asRecord, parseJsonString } from "./utils.ts";

export interface GranolaPluginSettings {
  enabled: Record<string, boolean>;
}

interface GranolaPluginSettingsFile {
  automationEnabled?: boolean;
  enabled?: Record<string, unknown>;
  markdownViewerEnabled?: boolean;
  [key: string]: unknown;
}

function normalisePluginSettings(
  value: unknown,
  definitions: GranolaPluginDefinition[],
): GranolaPluginSettings {
  const record = asRecord(value) as GranolaPluginSettingsFile | undefined;
  const enabled = defaultPluginEnabledMap(definitions);

  const rawEnabled = asRecord(record?.enabled);
  if (rawEnabled) {
    for (const [id, rawValue] of Object.entries(rawEnabled)) {
      if (typeof rawValue === "boolean") {
        enabled[id] = rawValue;
      }
    }
  }

  for (const definition of definitions) {
    const legacyKey = definition.compatibility?.legacySettingsEnabledKey;
    if (!legacyKey) {
      continue;
    }

    const legacyValue = record?.[legacyKey as keyof GranolaPluginSettingsFile];
    if (typeof legacyValue === "boolean") {
      enabled[definition.id] = legacyValue;
    }
  }

  return {
    enabled,
  };
}

export interface PluginSettingsStore {
  readSettings(): Promise<GranolaPluginSettings>;
  writeSettings(settings: GranolaPluginSettings): Promise<void>;
}

export class MemoryPluginSettingsStore implements PluginSettingsStore {
  #settings: GranolaPluginSettings;
  readonly #definitions: GranolaPluginDefinition[];

  constructor(
    settings: Partial<GranolaPluginSettings> = {},
    definitions: GranolaPluginDefinition[] = defaultPluginDefinitions(),
  ) {
    this.#definitions = definitions;
    this.#settings = {
      enabled: {
        ...defaultPluginEnabledMap(this.#definitions),
        ...settings.enabled,
      },
    };
  }

  async readSettings(): Promise<GranolaPluginSettings> {
    return {
      enabled: { ...this.#settings.enabled },
    };
  }

  async writeSettings(settings: GranolaPluginSettings): Promise<void> {
    this.#settings = {
      enabled: {
        ...defaultPluginEnabledMap(this.#definitions),
        ...settings.enabled,
      },
    };
  }
}

export class FilePluginSettingsStore implements PluginSettingsStore {
  readonly #definitions: GranolaPluginDefinition[];

  constructor(
    private readonly filePath: string = defaultPluginsFilePath(),
    definitions: GranolaPluginDefinition[] = defaultPluginDefinitions(),
  ) {
    this.#definitions = definitions;
  }

  async readSettings(): Promise<GranolaPluginSettings> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return normalisePluginSettings(parseJsonString(contents), this.#definitions);
    } catch {
      return {
        enabled: defaultPluginEnabledMap(this.#definitions),
      };
    }
  }

  async writeSettings(settings: GranolaPluginSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      `${JSON.stringify(
        {
          enabled: {
            ...defaultPluginEnabledMap(this.#definitions),
            ...settings.enabled,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
}

export function defaultPluginsFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().pluginsFile;
}

export function createDefaultPluginSettingsStore(
  filePath?: string,
  definitions: GranolaPluginDefinition[] = defaultPluginDefinitions(),
): PluginSettingsStore {
  return new FilePluginSettingsStore(filePath, definitions);
}
