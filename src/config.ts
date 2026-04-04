import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "./types.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
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

export async function loadConfig(options: {
  env?: NodeJS.ProcessEnv;
  globalFlags: FlagValues;
  subcommandFlags: FlagValues;
}): Promise<AppConfig> {
  const env = options.env ?? process.env;
  const configFile = pickString(options.globalFlags.config);
  const config = await loadTomlConfig(configFile);

  const configValues = config.values;
  const defaultSupabase = firstExistingPath(granolaSupabaseCandidates());
  const defaultCache = firstExistingPath(granolaCacheCandidates());

  const timeoutValue =
    pickString(options.subcommandFlags.timeout) ??
    pickString(env.TIMEOUT) ??
    pickString(configValues.timeout) ??
    "2m";

  return {
    automation: {
      rulesFile:
        pickString(options.globalFlags.rules) ??
        pickString(env.GRANOLA_AUTOMATION_RULES_FILE) ??
        pickString(configValues["automation-rules-file"]) ??
        pickString(configValues.automationRulesFile) ??
        defaultGranolaToolkitPersistenceLayout().automationRulesFile,
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
        pickString(configValues.output) ??
        "./notes",
      timeoutMs: parseDuration(timeoutValue),
    },
    supabase:
      pickString(options.globalFlags.supabase) ??
      pickString(env.SUPABASE_FILE) ??
      pickString(configValues.supabase) ??
      defaultSupabase,
    transcripts: {
      cacheFile:
        pickString(options.subcommandFlags.cache) ??
        pickString(env.CACHE_FILE) ??
        pickString(configValues["cache-file"]) ??
        pickString(configValues.cacheFile) ??
        defaultCache ??
        "",
      output:
        pickString(options.subcommandFlags.output) ??
        pickString(env.TRANSCRIPT_OUTPUT) ??
        pickString(configValues["transcript-output"]) ??
        pickString(configValues.transcriptOutput) ??
        "./transcripts",
    },
  };
}
