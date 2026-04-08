import { type GranolaExportTarget, type GranolaExportTargetKind } from "../app/index.ts";
import {
  listGranolaExportTargetDefinitions,
  parseGranolaExportTargetKind,
} from "../export-target-registry.ts";
import { toJson, toYaml } from "../render.ts";

import { createCommandAppContext } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

type TargetsFormat = "json" | "text" | "yaml";

function targetsHelp(): string {
  const kinds = listGranolaExportTargetDefinitions()
    .map((definition) => definition.kind)
    .join(" or ");
  return `Granola targets

Usage:
  granola targets [list|add|remove] [options]

Subcommands:
  list                Show configured export targets
  add                 Create or replace an export target
  remove <id>         Remove one export target

Options:
  --format <value>           text, json, yaml (default: text)
  --id <value>               Target id for add/remove
  --name <value>             Human label for the target
  --kind <value>             ${kinds} (default: bundle-folder)
  --output <path>            Root output directory for the target
  --notes-subdir <path>      Notes subdirectory inside the target root
  --transcripts-subdir <path>
                            Transcript subdirectory inside the target root
  --notes-format <value>     markdown, json, yaml, raw
  --transcripts-format <value>
                            text, markdown, json, yaml, raw
  --daily-notes-dir <path>   Optional daily note directory for obsidian-vault targets
  --config <path>            Path to .granola.toml
  --debug                    Enable debug logging
  -h, --help                 Show help
`;
}

function resolveFormat(value: string | boolean | undefined): TargetsFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid targets format: expected text, json, or yaml");
  }
}

function resolveKind(value: string | boolean | undefined): GranolaExportTargetKind {
  if (value === undefined) {
    return "bundle-folder";
  }

  const kind = parseGranolaExportTargetKind(value);
  if (!kind) {
    throw new Error(
      `invalid target kind: expected ${listGranolaExportTargetDefinitions()
        .map((definition) => definition.kind)
        .join(" or ")}`,
    );
  }

  return kind;
}

function resolveNotesFormat(
  value: string | boolean | undefined,
): GranolaExportTarget["notesFormat"] {
  switch (value) {
    case undefined:
      return undefined;
    case "json":
    case "markdown":
    case "raw":
    case "yaml":
      return value;
    default:
      throw new Error("invalid notes format: expected markdown, json, yaml, or raw");
  }
}

function resolveTranscriptsFormat(
  value: string | boolean | undefined,
): GranolaExportTarget["transcriptsFormat"] {
  switch (value) {
    case undefined:
      return undefined;
    case "json":
    case "markdown":
    case "raw":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid transcripts format: expected text, markdown, json, yaml, or raw");
  }
}

function renderTargets(targets: GranolaExportTarget[], format: TargetsFormat): string {
  if (format === "json") {
    return toJson({ targets });
  }

  if (format === "yaml") {
    return toYaml({ targets });
  }

  if (targets.length === 0) {
    return "No export targets configured\n";
  }

  const header = "ID                    KIND             ROOT";
  const lines = targets.map((target) => {
    const title = [target.name, target.outputDir].filter(Boolean).join(" · ");
    return `${target.id.padEnd(21).slice(0, 21)} ${target.kind.padEnd(16).slice(0, 16)} ${title}`;
  });

  return `${[header, ...lines].join("\n")}\n`;
}

function pickTargetId(
  commandArgs: string[],
  commandFlags: Record<string, string | boolean | undefined>,
): string {
  const id = typeof commandFlags.id === "string" ? commandFlags.id : commandArgs[1];
  if (!id?.trim()) {
    throw new Error("target id is required");
  }

  return id.trim();
}

function buildTargetFromFlags(
  commandFlags: Record<string, string | boolean | undefined>,
): GranolaExportTarget {
  const id = typeof commandFlags.id === "string" ? commandFlags.id.trim() : "";
  const outputDir = typeof commandFlags.output === "string" ? commandFlags.output.trim() : "";
  if (!id) {
    throw new Error("target id is required");
  }
  if (!outputDir) {
    throw new Error("target output directory is required");
  }

  return {
    dailyNotesDir:
      typeof commandFlags["daily-notes-dir"] === "string" && commandFlags["daily-notes-dir"].trim()
        ? commandFlags["daily-notes-dir"].trim()
        : undefined,
    id,
    kind: resolveKind(commandFlags.kind),
    name:
      typeof commandFlags.name === "string" && commandFlags.name.trim()
        ? commandFlags.name.trim()
        : undefined,
    notesFormat: resolveNotesFormat(commandFlags["notes-format"]),
    notesSubdir:
      typeof commandFlags["notes-subdir"] === "string" && commandFlags["notes-subdir"].trim()
        ? commandFlags["notes-subdir"].trim()
        : undefined,
    outputDir,
    transcriptsFormat: resolveTranscriptsFormat(commandFlags["transcripts-format"]),
    transcriptsSubdir:
      typeof commandFlags["transcripts-subdir"] === "string" &&
      commandFlags["transcripts-subdir"].trim()
        ? commandFlags["transcripts-subdir"].trim()
        : undefined,
  };
}

export const targetsCommand: CommandDefinition = {
  description: "Manage named export targets",
  flags: {
    "daily-notes-dir": { type: "string" },
    format: { type: "string" },
    help: { type: "boolean" },
    id: { type: "string" },
    kind: { type: "string" },
    name: { type: "string" },
    "notes-format": { type: "string" },
    "notes-subdir": { type: "string" },
    output: { type: "string" },
    "transcripts-format": { type: "string" },
    "transcripts-subdir": { type: "string" },
  },
  help: targetsHelp,
  name: "targets",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const subcommand = commandArgs[0] ?? "list";
    const { app } = await createCommandAppContext(commandFlags, globalFlags);

    switch (subcommand) {
      case "list": {
        const format = resolveFormat(commandFlags.format);
        const result = await app.listExportTargets();
        console.log(renderTargets(result.targets, format));
        return 0;
      }
      case "add": {
        const target = buildTargetFromFlags(commandFlags);
        const existing = (await app.listExportTargets()).targets;
        const nextTargets = [
          target,
          ...existing.filter((candidate) => candidate.id !== target.id),
        ].sort((left, right) => left.id.localeCompare(right.id));
        const result = await app.saveExportTargets(nextTargets);
        console.log(
          `Saved export target ${target.id} -> ${target.outputDir} (${result.targets.length} total)`,
        );
        return 0;
      }
      case "remove": {
        const id = pickTargetId(commandArgs, commandFlags);
        const existing = (await app.listExportTargets()).targets;
        const nextTargets = existing.filter((candidate) => candidate.id !== id);
        if (nextTargets.length === existing.length) {
          throw new Error(`export target not found: ${id}`);
        }
        await app.saveExportTargets(nextTargets);
        console.log(`Removed export target ${id}`);
        return 0;
      }
      default:
        throw new Error("invalid targets command: expected list, add, or remove");
    }
  },
};
