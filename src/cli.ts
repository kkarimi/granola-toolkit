import { commandMap, commands } from "./commands/index.ts";
import type { CommandDefinition } from "./commands/types.ts";
import { parseFlags } from "./flags.ts";
import { granolaCacheCandidates, granolaSupabaseCandidates } from "./utils.ts";

function splitCommand(argv: string[]): { command?: CommandDefinition; rest: string[] } {
  const rest: string[] = [];
  let command: CommandDefinition | undefined;

  for (const token of argv) {
    const candidate = !token.startsWith("-") ? commandMap.get(token) : undefined;
    if (!command && candidate) {
      command = candidate;
      continue;
    }

    rest.push(token);
  }

  return { command, rest };
}

function rootHelp(): string {
  const commandWidth = Math.max(...commands.map((command) => command.name.length));
  const commandLines = commands
    .map((command) => `  ${command.name.padEnd(commandWidth)}  ${command.description}`)
    .join("\n");

  return `Granola Toolkit

Work with Granola meetings, notes, and transcripts.

Usage:
  granola <command> [options]

Commands:
${commandLines}

Global options:
  --api-key <token>   Granola Personal API key
  --config <path>     Path to .granola.toml
  --debug             Enable debug logging
  --rules <path>      Path to automation rules JSON
  --supabase <path>   Path to supabase.json
  -h, --help          Show help

Examples:
  granola attach http://127.0.0.1:4123
  granola folder list
  granola sync
  granola notes --supabase "${granolaSupabaseCandidates()[0] ?? "/path/to/supabase.json"}"
  granola transcripts --cache "${granolaCacheCandidates()[0] ?? "/path/to/cache-v3.json"}"
`;
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const { command, rest } = splitCommand(argv);
    const global = parseFlags(rest, {
      "api-key": { type: "string" },
      config: { type: "string" },
      debug: { type: "boolean" },
      help: { type: "boolean" },
      rules: { type: "string" },
      supabase: { type: "string" },
    });

    if (global.values.help && !command) {
      console.log(rootHelp());
      return 0;
    }

    if (!command) {
      console.log(rootHelp());
      return 1;
    }

    const subcommand = parseFlags(global.rest, command.flags);

    if (subcommand.values.help || global.values.help) {
      console.log(command.help());
      return 0;
    }

    return await command.run({
      commandArgs: subcommand.rest,
      commandFlags: subcommand.values,
      globalFlags: global.values,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return 1;
  }
}
