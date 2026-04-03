import type { FlagValues } from "../config.ts";
import type { ParseSpec } from "../flags.ts";

export interface CommandContext {
  commandFlags: FlagValues;
  globalFlags: FlagValues;
}

export interface CommandDefinition {
  description: string;
  flags: Record<string, ParseSpec>;
  help(): string;
  name: string;
  run(context: CommandContext): Promise<number>;
}
