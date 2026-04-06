export const GRANOLA_AUTOMATION_PLUGIN_ID = "automation";
export const GRANOLA_MARKDOWN_VIEWER_PLUGIN_ID = "markdown-viewer";

export type GranolaPluginCapability = "automation" | "markdown-rendering";
export type GranolaPluginEnabledSource = "config" | "default" | "env" | "persisted" | "runtime";
export type GranolaPluginSettingsSection = "diagnostics" | "plugins";

export interface GranolaPluginCompatibility {
  configEnabledKeys?: string[];
  envEnabledKeys?: string[];
  legacySettingsEnabledKey?: string;
}

export interface GranolaPluginSettingsContribution {
  capability?: GranolaPluginCapability;
  id: string;
  section: GranolaPluginSettingsSection;
}

export interface GranolaPluginStatusDetails {
  disabled: string;
  enabled: string;
}

export interface GranolaPluginRuntimeSignals {
  automationRuntimeAvailable: boolean;
}

export interface GranolaPluginDefinition {
  capabilities: GranolaPluginCapability[];
  compatibility?: GranolaPluginCompatibility;
  configurable: boolean;
  defaultEnabled: boolean;
  description: string;
  id: string;
  label: string;
  runtimeDefaultEnabled?: (signals: GranolaPluginRuntimeSignals) => boolean | undefined;
  settingsContributions?: GranolaPluginSettingsContribution[];
  shipped: boolean;
  statusDetails?: GranolaPluginStatusDetails;
}

export interface GranolaPluginRegistry {
  getPlugin(id: string): GranolaPluginDefinition | undefined;
  listPlugins(): GranolaPluginDefinition[];
}

function clonePluginDefinition(definition: GranolaPluginDefinition): GranolaPluginDefinition {
  return {
    ...definition,
    capabilities: [...definition.capabilities],
    compatibility: definition.compatibility
      ? {
          ...definition.compatibility,
          configEnabledKeys: [...(definition.compatibility.configEnabledKeys ?? [])],
          envEnabledKeys: [...(definition.compatibility.envEnabledKeys ?? [])],
        }
      : undefined,
    settingsContributions: definition.settingsContributions
      ? definition.settingsContributions.map((contribution) => ({ ...contribution }))
      : undefined,
    statusDetails: definition.statusDetails ? { ...definition.statusDetails } : undefined,
  };
}

const builtInPlugins: GranolaPluginDefinition[] = [
  {
    capabilities: ["automation"],
    compatibility: {
      configEnabledKeys: ["automation-plugin-enabled", "automationPluginEnabled"],
      envEnabledKeys: ["GRANOLA_AUTOMATION_PLUGIN_ENABLED"],
      legacySettingsEnabledKey: "automationEnabled",
    },
    configurable: true,
    defaultEnabled: false,
    description:
      "Generate reviewable notes and enrichments, run harnesses, and process post-meeting automations.",
    id: GRANOLA_AUTOMATION_PLUGIN_ID,
    label: "Automation",
    runtimeDefaultEnabled: (signals) => (signals.automationRuntimeAvailable ? true : undefined),
    settingsContributions: [
      {
        capability: "automation",
        id: "automation-harness-editor",
        section: "plugins",
      },
      {
        capability: "automation",
        id: "automation-review-diagnostics",
        section: "diagnostics",
      },
    ],
    shipped: true,
    statusDetails: {
      disabled:
        "Enable this to unlock harnesses, review queues, automation commands, and post-meeting processing.",
      enabled:
        "Automation is live. Configure harnesses below, then use Review to inspect generated artefacts and approvals.",
    },
  },
  {
    capabilities: ["markdown-rendering"],
    compatibility: {
      configEnabledKeys: ["markdown-viewer-plugin-enabled", "markdownViewerPluginEnabled"],
      envEnabledKeys: ["GRANOLA_MARKDOWN_VIEWER_PLUGIN_ENABLED"],
      legacySettingsEnabledKey: "markdownViewerEnabled",
    },
    configurable: true,
    defaultEnabled: true,
    description:
      "Render meeting notes and markdown artefacts as readable documents in the browser while keeping the raw markdown available.",
    id: GRANOLA_MARKDOWN_VIEWER_PLUGIN_ID,
    label: "Markdown Viewer",
    shipped: true,
    statusDetails: {
      disabled: "Disable this if you prefer raw markdown everywhere in the web workspace.",
      enabled: "Notes and markdown artefacts render as readable documents in the browser.",
    },
  },
];

export class StaticGranolaPluginRegistry implements GranolaPluginRegistry {
  #pluginsById: Map<string, GranolaPluginDefinition>;

  constructor(private readonly plugins: GranolaPluginDefinition[]) {
    this.#pluginsById = new Map(
      plugins.map((plugin) => [plugin.id, clonePluginDefinition(plugin)]),
    );
  }

  getPlugin(id: string): GranolaPluginDefinition | undefined {
    const plugin = this.#pluginsById.get(id);
    return plugin ? clonePluginDefinition(plugin) : undefined;
  }

  listPlugins(): GranolaPluginDefinition[] {
    return this.plugins.map(clonePluginDefinition);
  }
}

export function createDefaultPluginRegistry(): GranolaPluginRegistry {
  return new StaticGranolaPluginRegistry(builtInPlugins);
}

export function defaultPluginDefinitions(): GranolaPluginDefinition[] {
  return builtInPlugins.map(clonePluginDefinition);
}

export function defaultPluginEnabledMap(
  definitions: GranolaPluginDefinition[] = defaultPluginDefinitions(),
): Record<string, boolean> {
  return Object.fromEntries(
    definitions.map((definition) => [definition.id, definition.defaultEnabled]),
  );
}

export function pluginStatusDetail(
  definition: Pick<GranolaPluginDefinition, "label" | "statusDetails">,
  enabled: boolean,
): string {
  if (definition.statusDetails) {
    return enabled ? definition.statusDetails.enabled : definition.statusDetails.disabled;
  }

  return enabled
    ? `${definition.label} is enabled for this workspace.`
    : `${definition.label} is shipped but currently disabled.`;
}

export function resolvePluginConfiguredEnablement(options: {
  configValues: Record<string, unknown>;
  definitions?: GranolaPluginDefinition[];
  env: Record<string, unknown>;
  envFlag: (value: unknown) => boolean | undefined;
  persistedEnabled?: Record<string, boolean>;
  pickBoolean: (value: unknown) => boolean | undefined;
}): {
  enabled: Record<string, boolean>;
  sources: Record<string, GranolaPluginEnabledSource>;
} {
  const definitions = options.definitions ?? defaultPluginDefinitions();
  const persistedEnabled = options.persistedEnabled ?? {};
  const enabled: Record<string, boolean> = {};
  const sources: Record<string, GranolaPluginEnabledSource> = {};

  for (const definition of definitions) {
    const envValue = definition.compatibility?.envEnabledKeys
      ?.map((key) => options.envFlag(options.env[key]))
      .find((value) => value !== undefined);
    if (envValue !== undefined) {
      enabled[definition.id] = envValue;
      sources[definition.id] = "env";
      continue;
    }

    const configValue = definition.compatibility?.configEnabledKeys
      ?.map((key) => options.pickBoolean(options.configValues[key]))
      .find((value) => value !== undefined);
    if (configValue !== undefined) {
      enabled[definition.id] = configValue;
      sources[definition.id] = "config";
      continue;
    }

    const persistedValue = persistedEnabled[definition.id];
    if (persistedValue !== undefined) {
      enabled[definition.id] = persistedValue;
      sources[definition.id] = "persisted";
      continue;
    }

    enabled[definition.id] = definition.defaultEnabled;
    sources[definition.id] = "default";
  }

  return {
    enabled,
    sources,
  };
}

export function applyPluginRuntimeDefaults(options: {
  definitions?: GranolaPluginDefinition[];
  enabled: Record<string, boolean>;
  signals: GranolaPluginRuntimeSignals;
  sources?: Record<string, GranolaPluginEnabledSource>;
}): {
  enabled: Record<string, boolean>;
  sources: Record<string, GranolaPluginEnabledSource>;
} {
  const definitions = options.definitions ?? defaultPluginDefinitions();
  const enabled = { ...options.enabled };
  const sources = { ...options.sources };

  for (const definition of definitions) {
    if (sources[definition.id] && sources[definition.id] !== "default") {
      continue;
    }
    const runtimeEnabled = definition.runtimeDefaultEnabled?.(options.signals);
    if (runtimeEnabled === undefined) {
      continue;
    }
    enabled[definition.id] = runtimeEnabled;
    sources[definition.id] = "runtime";
  }

  return {
    enabled,
    sources,
  };
}
