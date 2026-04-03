import type { FlagValues } from "./config.ts";

export type FlagType = "boolean" | "string";

export interface ParseSpec {
  type: FlagType;
}

function parseBooleanValue(value: string): boolean {
  if (/^(true|1|yes|on)$/i.test(value)) {
    return true;
  }

  if (/^(false|0|no|off)$/i.test(value)) {
    return false;
  }

  throw new Error(`invalid boolean value: ${value}`);
}

export function parseFlags(
  args: string[],
  spec: Record<string, ParseSpec>,
): { rest: string[]; values: FlagValues } {
  const values: FlagValues = {};
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]!;

    if (token === "--") {
      rest.push(...args.slice(index + 1));
      break;
    }

    if (token === "-h") {
      values.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      rest.push(token);
      continue;
    }

    const [rawName = "", inlineValue] = token.slice(2).split("=", 2);
    const name = rawName as keyof typeof spec;
    const definition = spec[name];

    if (!definition) {
      rest.push(token);
      continue;
    }

    if (definition.type === "boolean") {
      values[name] = inlineValue == null ? true : parseBooleanValue(inlineValue);
      continue;
    }

    if (inlineValue != null) {
      values[name] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next == null || next.startsWith("--")) {
      throw new Error(`missing value for --${name}`);
    }

    values[name] = next;
    index += 1;
  }

  return { rest, values };
}
