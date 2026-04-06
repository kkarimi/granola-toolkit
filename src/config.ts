import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve as resolvePath } from "node:path";

import type { AppConfig } from "./types.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
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

function parseTomlScalar(rawValue: string): unknown {
  const value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    if (value.startsWith('"')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.slice(1, -1);
      }
    }

    return value.slice(1, -1);
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function parseSimpleToml(contents: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) {
      continue;
    }

    const [, key = "", rawValue = ""] = match;
    values[key] = parseTomlScalar(rawValue);
  }

  return values;
}

async function loadTomlConfig(
  configPath?: string,
): Promise<{ path?: string; values: Record<string, unknown> }> {
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`config file not found: ${configPath}`);
    }

    const contents = await readUtf8(configPath);
    return {
      path: configPath,
      values: parseSimpleToml(contents),
    };
  }

  const candidates = [join(process.cwd(), ".granola.toml"), join(homedir(), ".granola.toml")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const contents = await readUtf8(candidate);
      return {
        path: candidate,
        values: parseSimpleToml(contents),
      };
    }
  }

  return { values: {} };
}

function envFlag(value: string | undefined): boolean | undefined {
  if (value == null) {
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

export async function loadConfig(options: {
  env?: NodeJS.ProcessEnv;
  globalFlags: FlagValues;
  subcommandFlags: FlagValues;
}): Promise<AppConfig> {
  const env = options.env ?? process.env;
  const configFile = pickString(options.globalFlags.config);
  const config = await loadTomlConfig(configFile);
  const configPath = config.path;

  const configValues = config.values;
  const defaultSupabase = firstExistingPath(granolaSupabaseCandidates());
  const defaultCache = firstExistingPath(granolaCacheCandidates());
  const pluginsFile =
    pickString(env.GRANOLA_PLUGINS_FILE) ??
    resolveConfigPath(
      configPath,
      pickString(configValues["plugins-file"]) ?? pickString(configValues.pluginsFile),
    ) ??
    defaultGranolaToolkitPersistenceLayout().pluginsFile;
  const persistedPlugins = await createDefaultPluginSettingsStore(pluginsFile).readSettings();
  const agentTimeoutValue =
    pickString(env.GRANOLA_AGENT_TIMEOUT) ??
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
        pickString(env.GRANOLA_AUTOMATION_ARTEFACTS_FILE) ??
        resolveConfigPath(
          configPath,
          pickString(configValues["automation-artefacts-file"]) ??
            pickString(configValues.automationArtefactsFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().automationArtefactsFile,
      pkmTargetsFile:
        pickString(env.GRANOLA_PKM_TARGETS_FILE) ??
        resolveConfigPath(
          configPath,
          pickString(configValues["pkm-targets-file"]) ?? pickString(configValues.pkmTargetsFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().pkmTargetsFile,
      rulesFile:
        pickString(options.globalFlags.rules) ??
        pickString(env.GRANOLA_AUTOMATION_RULES_FILE) ??
        resolveConfigPath(
          configPath,
          pickString(configValues["automation-rules-file"]) ??
            pickString(configValues.automationRulesFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().automationRulesFile,
    },
    agents: {
      codexCommand:
        pickString(env.GRANOLA_CODEX_COMMAND) ??
        pickString(configValues["codex-command"]) ??
        pickString(configValues.codexCommand) ??
        "codex",
      defaultModel:
        pickString(env.GRANOLA_AGENT_MODEL) ??
        pickString(configValues["agent-model"]) ??
        pickString(configValues.agentModel),
      defaultProvider: (() => {
        const value =
          pickString(env.GRANOLA_AGENT_PROVIDER) ??
          pickString(configValues["agent-provider"]) ??
          pickString(configValues.agentProvider);
        return value === "codex" || value === "openai" || value === "openrouter"
          ? value
          : undefined;
      })(),
      dryRun:
        envFlag(env.GRANOLA_AGENT_DRY_RUN) ??
        pickBoolean(configValues["agent-dry-run"]) ??
        pickBoolean(configValues.agentDryRun) ??
        false,
      harnessesFile:
        pickString(env.GRANOLA_AGENT_HARNESSES_FILE) ??
        resolveConfigPath(
          configPath,
          pickString(configValues["agent-harnesses-file"]) ??
            pickString(configValues.agentHarnessesFile),
        ) ??
        defaultGranolaToolkitPersistenceLayout().agentHarnessesFile,
      maxRetries:
        pickNumber(env.GRANOLA_AGENT_MAX_RETRIES) ??
        pickNumber(configValues["agent-max-retries"]) ??
        pickNumber(configValues.agentMaxRetries) ??
        2,
      openaiBaseUrl:
        pickString(env.GRANOLA_OPENAI_BASE_URL) ??
        pickString(env.OPENAI_BASE_URL) ??
        pickString(configValues["openai-base-url"]) ??
        pickString(configValues.openaiBaseUrl) ??
        "https://api.openai.com/v1",
      openrouterBaseUrl:
        pickString(env.GRANOLA_OPENROUTER_BASE_URL) ??
        pickString(env.OPENROUTER_BASE_URL) ??
        pickString(configValues["openrouter-base-url"]) ??
        pickString(configValues.openrouterBaseUrl) ??
        "https://openrouter.ai/api/v1",
      timeoutMs: parseDuration(agentTimeoutValue),
    },
    apiKey:
      pickString(options.globalFlags["api-key"]) ??
      pickString(env.GRANOLA_API_KEY) ??
      pickString(configValues["api-key"]) ??
      pickString(configValues.apiKey),
    configFileUsed: config.path,
    debug:
      pickBoolean(options.globalFlags.debug) ??
      envFlag(env.DEBUG_MODE) ??
      pickBoolean(configValues.debug) ??
      false,
    notes: {
      output:
        pickString(options.subcommandFlags.output) ??
        pickString(env.OUTPUT) ??
        resolveConfigPath(configPath, pickString(configValues.output)) ??
        "./notes",
      timeoutMs: parseDuration(timeoutValue),
    },
    plugins: {
      automationEnabled:
        envFlag(env.GRANOLA_AUTOMATION_PLUGIN_ENABLED) ??
        pickBoolean(configValues["automation-plugin-enabled"]) ??
        pickBoolean(configValues.automationPluginEnabled) ??
        persistedPlugins.automationEnabled,
      settingsFile: pluginsFile,
    },
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
