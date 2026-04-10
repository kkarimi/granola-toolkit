import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";

import type { AppConfig } from "./types.ts";
import type { GranEventHook } from "./types.ts";
import {
  defaultGranolaToolkitConfigFile,
  defaultGranolaToolkitPersistenceLayout,
} from "./persistence/layout.ts";
import {
  defaultPluginDefinitions,
  resolvePluginConfiguredEnablement,
  type GranolaPluginDefinition,
} from "./plugin-registry.ts";
import { createDefaultPluginSettingsStore } from "./plugins.ts";
import {
  firstExistingPath,
  granolaCacheCandidates,
  granolaSupabaseCandidates,
  parseDuration,
  readUtf8,
} from "./utils.ts";

export interface FlagValues {
  [key: string]: string | boolean | undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function pickNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.map((entry) => pickString(entry));
  if (entries.some((entry) => entry === undefined)) {
    return undefined;
  }

  return entries as string[];
}

function pickStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).map(([key, entry]) => [key, pickString(entry)] as const);
  if (entries.some(([, entry]) => entry === undefined)) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

function pickEnvString(
  env: Record<string, string | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = pickString(env[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function pickEnvNumber(
  env: Record<string, string | undefined>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = pickNumber(env[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function pickEnvFlag(
  env: Record<string, string | undefined>,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = envFlag(env[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function parseJsonConfig(contents: string): Record<string, unknown> {
  const parsed = JSON.parse(contents) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("config file must contain a JSON object");
  }

  return parsed as Record<string, unknown>;
}

async function loadConfigFile(
  configPath?: string,
): Promise<{ path?: string; values: Record<string, unknown> }> {
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`config file not found: ${configPath}`);
    }

    const contents = await readUtf8(configPath);
    return {
      path: configPath,
      values: parseJsonConfig(contents),
    };
  }

  const candidates = [
    join(process.cwd(), ".gran", "config.json"),
    defaultGranolaToolkitConfigFile(homedir()),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const contents = await readUtf8(candidate);
      return {
        path: candidate,
        values: parseJsonConfig(contents),
      };
    }
  }

  return { values: {} };
}

function envFlag(value: unknown): boolean | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  if (/^(1|true|yes|on)$/i.test(value)) {
    return true;
  }

  if (/^(0|false|no|off)$/i.test(value)) {
    return false;
  }

  return undefined;
}

function resolvePluginsConfig(options: {
  configValues: Record<string, unknown>;
  definitions: GranolaPluginDefinition[];
  env: Record<string, string | undefined>;
  persistedEnabled: Record<string, boolean>;
  settingsFile: string;
}): NonNullable<AppConfig["plugins"]> {
  const resolved = resolvePluginConfiguredEnablement({
    configValues: options.configValues,
    definitions: options.definitions,
    env: options.env,
    envFlag,
    persistedEnabled: options.persistedEnabled,
    pickBoolean,
  });

  return {
    enabled: resolved.enabled,
    settingsFile: options.settingsFile,
    sources: resolved.sources,
  };
}

function resolveConfigPath(
  configPath: string | undefined,
  value: string | undefined,
): string | undefined {
  if (!value?.trim()) {
    return value;
  }

  if (!configPath || isAbsolute(value)) {
    return value;
  }

  return resolvePath(dirname(configPath), value);
}

function resolveHook(value: unknown, index: number, configPath?: string): GranEventHook {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid hook at index ${index}: expected an object`);
  }

  const record = value as Record<string, unknown>;
  const id = pickString(record.id) ?? `hook-${index + 1}`;
  const kind = pickString(record.kind);
  const events = pickStringArray(record.events);

  if (record.events !== undefined && !events) {
    throw new Error(`invalid hook ${id}: events must be an array of strings`);
  }

  const inferredScript = kind === "script" || (!kind && pickString(record.run));
  const inferredWebhook = kind === "webhook" || (!kind && pickString(record.url));

  if (inferredScript) {
    const run = resolveConfigPath(configPath, pickString(record.run));
    if (!run) {
      throw new Error(`invalid hook ${id}: script hooks require a run path`);
    }

    const args = pickStringArray(record.args);
    if (record.args !== undefined && !args) {
      throw new Error(`invalid hook ${id}: args must be an array of strings`);
    }

    const env = pickStringRecord(record.env);
    if (record.env !== undefined && !env) {
      throw new Error(`invalid hook ${id}: env must be an object of strings`);
    }

    const cwd = resolveConfigPath(configPath, pickString(record.cwd));
    return {
      args,
      cwd,
      env,
      events,
      id,
      kind: "script",
      run,
    };
  }

  if (inferredWebhook) {
    const url = pickString(record.url);
    if (!url) {
      throw new Error(`invalid hook ${id}: webhook hooks require a url`);
    }

    const headers = pickStringRecord(record.headers);
    if (record.headers !== undefined && !headers) {
      throw new Error(`invalid hook ${id}: headers must be an object of strings`);
    }

    return {
      events,
      headers,
      id,
      kind: "webhook",
      url,
    };
  }

  throw new Error(`invalid hook ${id}: expected a script run path or webhook url`);
}

function resolveHooksConfig(
  configPath: string | undefined,
  configValues: Record<string, unknown>,
): NonNullable<AppConfig["hooks"]> | undefined {
  if (configValues.hooks === undefined) {
    return undefined;
  }

  if (!Array.isArray(configValues.hooks)) {
    throw new Error("hooks must be an array");
  }

  return {
    items: configValues.hooks.map((hook, index) => resolveHook(hook, index, configPath)),
  };
}

export async function loadConfig(options: {
  env?: NodeJS.ProcessEnv;
  globalFlags: FlagValues;
  subcommandFlags: FlagValues;
}): Promise<AppConfig> {
  const env = options.env ?? process.env;
  const configFile = pickString(options.globalFlags.config);
  const config = await loadConfigFile(configFile);
  const configPath = config.path;

  const configValues = config.values;
  const defaultSupabase = firstExistingPath(granolaSupabaseCandidates());
  const defaultCache = firstExistingPath(granolaCacheCandidates());
  const pluginsFile =
    pickEnvString(env, "GRAN_PLUGINS_FILE", "GRANOLA_PLUGINS_FILE") ??
    resolveConfigPath(
      configPath,
      pickString(configValues["plugins-file"]) ?? pickString(configValues.pluginsFile),
    ) ??
    defaultGranolaToolkitPersistenceLayout().pluginsFile;
  const pluginDefinitions = defaultPluginDefinitions();
  const persistedPlugins = await createDefaultPluginSettingsStore(
    pluginsFile,
    pluginDefinitions,
  ).readSettings();
  const agentTimeoutValue =
    pickEnvString(env, "GRAN_AGENT_TIMEOUT", "GRANOLA_AGENT_TIMEOUT") ??
    pickString(configValues["agent-timeout"]) ??
    pickString(configValues.agentTimeout) ??
    "5m";

  const timeoutValue =
    pickString(options.subcommandFlags.timeout) ??
    pickString(env.TIMEOUT) ??
    pickString(configValues.timeout) ??
    "2m";

  return {
    automation: {
      artefactsFile:
        pickEnvString(env, "GRAN_AUTOMATION_ARTEFACTS_FILE", "GRANOLA_AUTOMATION_ARTEFACTS_FILE") ??
        resolveConfigPath(
          configPath,
          pickString(configValues["automation-artefacts-file"]) ??
            pickString(configValues.automationArtefactsFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().automationArtefactsFile,
      pkmTargetsFile:
        pickEnvString(env, "GRAN_PKM_TARGETS_FILE", "GRANOLA_PKM_TARGETS_FILE") ??
        resolveConfigPath(
          configPath,
          pickString(configValues["pkm-targets-file"]) ?? pickString(configValues.pkmTargetsFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().pkmTargetsFile,
      rulesFile:
        pickString(options.globalFlags.rules) ??
        pickEnvString(env, "GRAN_AUTOMATION_RULES_FILE", "GRANOLA_AUTOMATION_RULES_FILE") ??
        resolveConfigPath(
          configPath,
          pickString(configValues["automation-rules-file"]) ??
            pickString(configValues.automationRulesFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().automationRulesFile,
    },
    agents: {
      codexCommand:
        pickEnvString(env, "GRAN_CODEX_COMMAND", "GRANOLA_CODEX_COMMAND") ??
        pickString(configValues["codex-command"]) ??
        pickString(configValues.codexCommand) ??
        "codex",
      defaultModel:
        pickEnvString(env, "GRAN_AGENT_MODEL", "GRANOLA_AGENT_MODEL") ??
        pickString(configValues["agent-model"]) ??
        pickString(configValues.agentModel),
      defaultProvider: (() => {
        const value =
          pickEnvString(env, "GRAN_AGENT_PROVIDER", "GRANOLA_AGENT_PROVIDER") ??
          pickString(configValues["agent-provider"]) ??
          pickString(configValues.agentProvider);
        return value === "codex" || value === "openai" || value === "openrouter"
          ? value
          : undefined;
      })(),
      dryRun:
        pickEnvFlag(env, "GRAN_AGENT_DRY_RUN", "GRANOLA_AGENT_DRY_RUN") ??
        pickBoolean(configValues["agent-dry-run"]) ??
        pickBoolean(configValues.agentDryRun) ??
        false,
      harnessesFile:
        pickEnvString(env, "GRAN_AGENT_HARNESSES_FILE", "GRANOLA_AGENT_HARNESSES_FILE") ??
        resolveConfigPath(
          configPath,
          pickString(configValues["agent-harnesses-file"]) ??
            pickString(configValues.agentHarnessesFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().agentHarnessesFile,
      maxRetries:
        pickEnvNumber(env, "GRAN_AGENT_MAX_RETRIES", "GRANOLA_AGENT_MAX_RETRIES") ??
        pickNumber(configValues["agent-max-retries"]) ??
        pickNumber(configValues.agentMaxRetries) ??
        2,
      openaiBaseUrl:
        pickEnvString(env, "GRAN_OPENAI_BASE_URL", "GRANOLA_OPENAI_BASE_URL") ??
        pickString(env.OPENAI_BASE_URL) ??
        pickString(configValues["openai-base-url"]) ??
        pickString(configValues.openaiBaseUrl) ??
        "https://api.openai.com/v1",
      openrouterBaseUrl:
        pickEnvString(env, "GRAN_OPENROUTER_BASE_URL", "GRANOLA_OPENROUTER_BASE_URL") ??
        pickString(env.OPENROUTER_BASE_URL) ??
        pickString(configValues["openrouter-base-url"]) ??
        pickString(configValues.openrouterBaseUrl) ??
        "https://openrouter.ai/api/v1",
      timeoutMs: parseDuration(agentTimeoutValue),
    },
    apiKey:
      pickString(options.globalFlags["api-key"]) ??
      pickEnvString(env, "GRAN_API_KEY", "GRANOLA_API_KEY") ??
      pickString(configValues["api-key"]) ??
      pickString(configValues.apiKey),
    configFileUsed: config.path,
    debug:
      pickBoolean(options.globalFlags.debug) ??
      envFlag(env.DEBUG_MODE) ??
      pickBoolean(configValues.debug) ??
      false,
    exports: {
      targetsFile:
        pickEnvString(env, "GRAN_EXPORT_TARGETS_FILE", "GRANOLA_EXPORT_TARGETS_FILE") ??
        resolveConfigPath(
          configPath,
          pickString(configValues["export-targets-file"]) ??
            pickString(configValues.exportTargetsFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().exportTargetsFile,
    },
    hooks: resolveHooksConfig(configPath, configValues),
    notes: {
      output:
        pickString(options.subcommandFlags.output) ??
        pickString(env.OUTPUT) ??
        resolveConfigPath(configPath, pickString(configValues.output)) ??
        "./notes",
      timeoutMs: parseDuration(timeoutValue),
    },
    plugins: resolvePluginsConfig({
      configValues,
      definitions: pluginDefinitions,
      env,
      persistedEnabled: persistedPlugins.enabled,
      settingsFile: pluginsFile,
    }),
    supabase:
      pickString(options.globalFlags.supabase) ??
      pickString(env.SUPABASE_FILE) ??
      resolveConfigPath(configPath, pickString(configValues.supabase)) ??
      defaultSupabase,
    transcripts: {
      cacheFile:
        pickString(options.subcommandFlags.cache) ??
        pickString(env.CACHE_FILE) ??
        resolveConfigPath(
          configPath,
          pickString(configValues["cache-file"]) ?? pickString(configValues.cacheFile),
        ) ??
        defaultCache ??
        "",
      output:
        pickString(options.subcommandFlags.output) ??
        pickString(env.TRANSCRIPT_OUTPUT) ??
        resolveConfigPath(
          configPath,
          pickString(configValues["transcript-output"]) ??
            pickString(configValues.transcriptOutput),
        ) ??
        "./transcripts",
    },
  };
}
