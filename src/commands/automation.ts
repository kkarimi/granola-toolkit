import {
  createGranolaApp,
  type GranolaAutomationMatch,
  type GranolaAutomationRule,
} from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { toJson, toYaml } from "../render.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

type AutomationFormat = "json" | "text" | "yaml";

function automationHelp(): string {
  return `Granola automation

Usage:
  granola automation <rules|matches> [options]

Subcommands:
  rules               List configured automation rules
  matches             Show recent rule matches from sync events

Options:
  --format <value>    text, json, yaml (default: text)
  --limit <n>         Number of matches to show (default: 20)
  --rules <path>      Path to automation rules JSON
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

function resolveFormat(value: string | boolean | undefined): AutomationFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid automation format: expected text, json, or yaml");
  }
}

function parseLimit(value: string | boolean | undefined): number {
  if (value === undefined) {
    return 20;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("invalid automation limit: expected a positive integer");
  }

  return Number(value);
}

function renderRules(rules: GranolaAutomationRule[], format: AutomationFormat): string {
  if (format === "json") {
    return toJson({ rules });
  }

  if (format === "yaml") {
    return toYaml({ rules });
  }

  if (rules.length === 0) {
    return "No automation rules configured\n";
  }

  const header = "ID                      ENABLED  EVENTS                 FILTERS";
  const lines = rules.map((rule) => {
    const filters = [
      rule.when.folderIds?.length ? `folderIds=${rule.when.folderIds.join(",")}` : "",
      rule.when.folderNames?.length ? `folderNames=${rule.when.folderNames.join(",")}` : "",
      rule.when.tags?.length ? `tags=${rule.when.tags.join(",")}` : "",
      rule.when.titleIncludes?.length ? `title~=${rule.when.titleIncludes.join(",")}` : "",
      rule.when.transcriptLoaded === true ? "transcriptLoaded=true" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `${rule.id.padEnd(23).slice(0, 23)} ${(rule.enabled === false ? "no" : "yes").padEnd(8)} ${(rule.when.eventKinds?.join(",") || "any").padEnd(22).slice(0, 22)} ${filters || "-"}`;
  });

  return `${[header, ...lines].join("\n")}\n`;
}

function renderMatches(matches: GranolaAutomationMatch[], format: AutomationFormat): string {
  if (format === "json") {
    return toJson({ matches });
  }

  if (format === "yaml") {
    return toYaml({ matches });
  }

  if (matches.length === 0) {
    return "No automation matches yet\n";
  }

  const header = "MATCHED AT            RULE                    EVENT               TITLE";
  const lines = matches.map((match) => {
    const matchedAt = match.matchedAt.slice(0, 19).padEnd(21);
    const ruleName = match.ruleName.padEnd(23).slice(0, 23);
    const eventKind = match.eventKind.padEnd(18).slice(0, 18);
    return `${matchedAt} ${ruleName} ${eventKind} ${match.title} (${match.meetingId})`;
  });

  return `${[header, ...lines].join("\n")}\n`;
}

export const automationCommand: CommandDefinition = {
  description: "Inspect automation rules and rule matches",
  flags: {
    format: { type: "string" },
    help: { type: "boolean" },
    limit: { type: "string" },
    timeout: { type: "string" },
  },
  help: automationHelp,
  name: "automation",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const [action] = commandArgs;
    const format = resolveFormat(commandFlags.format);
    const config = await loadConfig({
      globalFlags,
      subcommandFlags: commandFlags,
    });

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "automationRules", config.automation?.rulesFile ?? "(default)");

    const app = await createGranolaApp(config);

    switch (action) {
      case "rules": {
        const result = await app.listAutomationRules();
        console.log(renderRules(result.rules, format).trimEnd());
        return 0;
      }
      case "matches": {
        const result = await app.listAutomationMatches({ limit: parseLimit(commandFlags.limit) });
        console.log(renderMatches(result.matches, format).trimEnd());
        return 0;
      }
      case undefined:
        console.log(automationHelp());
        return 1;
      default:
        throw new Error("invalid automation command: expected rules or matches");
    }
  },
};
