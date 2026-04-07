import { createGranolaApp } from "../app/index.ts";
import { loadConfig } from "../config.ts";
import { renderExportScopeLabel } from "../export-scope.ts";
import { toJson, toYaml } from "../render.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

type ExportListFormat = "json" | "text" | "yaml";

function exportsHelp(): string {
  return `Granola exports

Usage:
  granola exports <list|rerun> [options]

Subcommands:
  list                Show recent export jobs
  rerun <job-id>      Rerun a previous notes or transcripts export job

Options:
  --cache <path>      Path to Granola desktop transcript file
  --format <value>    list output format: text, json, yaml (default: text)
  --limit <n>         Number of jobs to show for list (default: 20)
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

function resolveListFormat(value: string | boolean | undefined): ExportListFormat {
  switch (value) {
    case undefined:
      return "text";
    case "json":
    case "text":
    case "yaml":
      return value;
    default:
      throw new Error("invalid exports format: expected text, json, or yaml");
  }
}

function parseLimit(value: string | boolean | undefined): number {
  if (value === undefined) {
    return 20;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("invalid exports limit: expected a positive integer");
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("invalid exports limit: expected a positive integer");
  }

  return limit;
}

function renderExportJobs(
  jobs: Awaited<ReturnType<Awaited<ReturnType<typeof createGranolaApp>>["listExportJobs"]>>["jobs"],
  format: ExportListFormat,
): string {
  if (format === "json") {
    return toJson({ jobs });
  }

  if (format === "yaml") {
    return toYaml({ jobs });
  }

  if (jobs.length === 0) {
    return "No export jobs\n";
  }

  const header =
    "ID                           KIND         STATUS      FORMAT      SCOPE                ITEMS   WRITTEN  STARTED";
  const lines = jobs.map((job) => {
    const id = job.id.padEnd(28).slice(0, 28);
    const kind = job.kind.padEnd(12);
    const status = job.status.padEnd(11);
    const formatValue = job.format.padEnd(11);
    const scope = renderExportScopeLabel(job.scope).padEnd(20).slice(0, 20);
    const items = String(job.itemCount).padEnd(7);
    const written = String(job.written).padEnd(8);
    const started = job.startedAt.slice(0, 19);
    return `${id} ${kind} ${status} ${formatValue} ${scope} ${items} ${written} ${started}`;
  });

  return `${[header, ...lines].join("\n")}\n`;
}

export const exportsCommand: CommandDefinition = {
  description: "List and rerun tracked export jobs",
  flags: {
    cache: { type: "string" },
    format: { type: "string" },
    help: { type: "boolean" },
    limit: { type: "string" },
    timeout: { type: "string" },
  },
  help: exportsHelp,
  name: "exports",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const [action, id] = commandArgs;

    switch (action) {
      case "list":
        return await list(commandFlags, globalFlags);
      case "rerun":
        if (!id) {
          throw new Error("exports rerun requires a job id");
        }
        return await rerun(id, commandFlags, globalFlags);
      case undefined:
        console.log(exportsHelp());
        return 1;
      default:
        throw new Error("invalid exports command: expected list or rerun");
    }
  },
};

async function list(
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const format = resolveListFormat(commandFlags.format);
  const limit = parseLimit(commandFlags.limit);
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });

  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  const app = await createGranolaApp(config);
  const result = await app.listExportJobs({ limit });
  console.log(renderExportJobs(result.jobs, format).trimEnd());
  return 0;
}

async function rerun(
  id: string,
  commandFlags: Record<string, string | boolean | undefined>,
  globalFlags: Record<string, string | boolean | undefined>,
): Promise<number> {
  const config = await loadConfig({
    globalFlags,
    subcommandFlags: commandFlags,
  });

  debug(config.debug, "using config", config.configFileUsed ?? "(none)");
  debug(config.debug, "supabase", config.supabase);
  debug(config.debug, "cacheFile", config.transcripts.cacheFile || "(none)");
  const app = await createGranolaApp(config);
  const result = await app.rerunExportJob(id);

  if ("documentCount" in result) {
    console.log(
      `✓ Reran notes export job ${result.job.id} from ${renderExportScopeLabel(result.scope)} to ${result.outputDir} (${result.written}/${result.documentCount} written)`,
    );
    return 0;
  }

  console.log(
    `✓ Reran transcripts export job ${result.job.id} from ${renderExportScopeLabel(result.scope)} to ${result.outputDir} (${result.written}/${result.transcriptCount} written)`,
  );
  return 0;
}
