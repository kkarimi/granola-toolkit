import { relative, resolve as resolvePath } from "node:path";

import { initialiseGranolaToolkitProject } from "../init.ts";
import type { GranolaAgentProviderKind } from "../types.ts";

import { maybeRunGuidedSetupAfterInit } from "./guided-setup.ts";
import type { CommandDefinition } from "./types.ts";

function initHelp(): string {
  return `Gran init

Usage:
  gran init [options]

Create a local project bootstrap with:
  - .gran.json
  - starter automation rules
  - starter harness definitions
  - prompt files for common meeting types

Options:
  --dir <path>        Target directory (default: current directory)
  --force             Overwrite existing generated files
  --guided            Start guided setup immediately after bootstrap
  --model <value>     Override the starter model for generated harnesses
  --provider <value>  codex, openai, openrouter (default: codex)
  --skip-guide        Skip the interactive guided setup prompt
  -h, --help          Show help
`;
}

function parseProvider(value: string | boolean | undefined): GranolaAgentProviderKind {
  switch (value) {
    case undefined:
      return "codex";
    case "codex":
    case "openai":
    case "openrouter":
      return value;
    default:
      throw new Error("invalid init provider: expected codex, openai, or openrouter");
  }
}

function providerNextStep(provider: GranolaAgentProviderKind): string {
  switch (provider) {
    case "openai":
      return "2. Export OPENAI_API_KEY in the shell or service that runs your sync loop.";
    case "openrouter":
      return "2. Export OPENROUTER_API_KEY in the shell or service that runs your sync loop.";
    default:
      return "2. Make sure `codex exec` works locally before you enable agent-driven automation.";
  }
}

export const initCommand: CommandDefinition = {
  description: "Create a local Gran project bootstrap",
  flags: {
    dir: { type: "string" },
    force: { type: "boolean" },
    guided: { type: "boolean" },
    help: { type: "boolean" },
    model: { type: "string" },
    provider: { type: "string" },
    "skip-guide": { type: "boolean" },
  },
  help: initHelp,
  name: "init",
  async run({ commandArgs, commandFlags, globalFlags }) {
    if (commandArgs.length > 0) {
      throw new Error("gran init does not accept positional arguments");
    }

    const directory =
      typeof commandFlags.dir === "string" && commandFlags.dir.trim()
        ? commandFlags.dir.trim()
        : process.cwd();
    const provider = parseProvider(commandFlags.provider);
    const result = await initialiseGranolaToolkitProject({
      directory,
      force: commandFlags.force === true,
      model: typeof commandFlags.model === "string" ? commandFlags.model.trim() : undefined,
      provider,
    });
    const root = resolvePath(result.directory);

    console.log(`Initialised Gran 👵🏻 in ${root}`);
    console.log("");
    console.log("Created:");
    for (const filePath of result.createdFiles) {
      console.log(`  - ./${relative(root, filePath)}`);
    }

    const guidedExitCode = await maybeRunGuidedSetupAfterInit({
      commandFlags,
      configPath: result.configPath,
      globalFlags,
    });
    if (guidedExitCode !== undefined) {
      return guidedExitCode;
    }

    console.log("");
    console.log("Next:");
    console.log("  gran web --config ./.gran.json");
    console.log("  gran tui --config ./.gran.json");
    console.log("");
    console.log(providerNextStep(provider));
    console.log("Edit ./.gran/prompts/ when you want to tune meeting-specific agent output.");
    return 0;
  },
};
