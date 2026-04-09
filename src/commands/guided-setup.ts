import { stdin as defaultInput, stdout as defaultOutput } from "node:process";
import { createInterface } from "node:readline/promises";

import type { GranolaApp, GranolaAppAuthState, GranolaAppSyncResult } from "../app/index.ts";
import { granolaAuthModeLabel } from "../auth-summary.ts";
import type { FlagValues } from "../config.ts";

import { createCommandAppContext } from "./shared.ts";
import { tuiCommand } from "./tui.ts";
import type { CommandContext } from "./types.ts";
import { webCommand } from "./web.ts";

type GuidedSetupSurface = "tui" | "web";
type GuidedSetupAuthChoice = "api-key" | "desktop" | "keep" | "skip";

export interface GuidedSetupPrompter {
  ask(prompt: string): Promise<string>;
  close(): Promise<void> | void;
}

export interface GuidedSetupFlowOptions {
  configPath: string;
  createAppContext?: typeof createCommandAppContext;
  globalFlags: FlagValues;
  log?: typeof console.log;
  prompt: GuidedSetupPrompter;
}

export interface GuidedSetupLaunchPlan {
  surface: GuidedSetupSurface;
}

export interface MaybeRunGuidedSetupOptions extends Omit<GuidedSetupFlowOptions, "prompt"> {
  commandFlags: FlagValues;
  interactive?: boolean;
  launchTui?: (context: CommandContext) => Promise<number>;
  launchWeb?: (context: CommandContext) => Promise<number>;
  prompt?: GuidedSetupPrompter;
  promptFactory?: () => GuidedSetupPrompter;
}

function promptLabel(index: number, label: string, description?: string): string {
  return description ? `  ${index}. ${label} (${description})` : `  ${index}. ${label}`;
}

export function canRunGuidedSetupInteractively(
  input: Pick<typeof defaultInput, "isTTY"> = defaultInput,
  output: Pick<typeof defaultOutput, "isTTY"> = defaultOutput,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(input.isTTY && output.isTTY && !env.CI);
}

export function createReadlineGuidedSetupPrompter(): GuidedSetupPrompter {
  const prompt = createInterface({
    input: defaultInput,
    output: defaultOutput,
  });

  return {
    ask(question: string) {
      return prompt.question(question);
    },
    close() {
      prompt.close();
    },
  };
}

async function askChoice<T extends string>(
  prompt: GuidedSetupPrompter,
  log: typeof console.log,
  question: string,
  options: Array<{ description?: string; label: string; value: T }>,
  defaultValue: T,
): Promise<T> {
  const defaultIndex = Math.max(
    0,
    options.findIndex((option) => option.value === defaultValue),
  );

  log(question);
  for (const [index, option] of options.entries()) {
    log(promptLabel(index + 1, option.label, option.description));
  }

  while (true) {
    const answer = (await prompt.ask(`Choose [${defaultIndex + 1}]: `)).trim();
    if (!answer) {
      return defaultValue;
    }

    const choice = Number(answer);
    if (Number.isInteger(choice) && choice >= 1 && choice <= options.length) {
      return options[choice - 1]!.value;
    }

    log(`Enter a number from 1 to ${options.length}.`);
  }
}

async function askConfirm(
  prompt: GuidedSetupPrompter,
  question: string,
  defaultValue = true,
  log: typeof console.log = console.log,
): Promise<boolean> {
  const suffix = defaultValue ? "[Y/n]" : "[y/N]";
  while (true) {
    const answer = (await prompt.ask(`${question} ${suffix} `)).trim().toLowerCase();
    if (!answer) {
      return defaultValue;
    }

    if (["y", "yes"].includes(answer)) {
      return true;
    }

    if (["n", "no"].includes(answer)) {
      return false;
    }

    log("Answer yes or no.");
  }
}

function hasConfiguredAuth(state: GranolaAppAuthState): boolean {
  return state.apiKeyAvailable || state.storedSessionAvailable || state.supabaseAvailable;
}

function formatAuthSummary(state: GranolaAppAuthState): string {
  return `Connected with ${granolaAuthModeLabel(state.mode)}`;
}

function describeSyncResult(result: GranolaAppSyncResult): string {
  return `Imported ${result.summary.meetingCount} meeting(s) across ${result.summary.folderCount} folder(s) (${result.summary.createdCount} created, ${result.summary.changedCount} updated, ${result.summary.removedCount} removed).`;
}

function authChoices(state: GranolaAppAuthState): Array<{
  description?: string;
  label: string;
  value: GuidedSetupAuthChoice;
}> {
  const choices: Array<{
    description?: string;
    label: string;
    value: GuidedSetupAuthChoice;
  }> = [];

  if (hasConfiguredAuth(state)) {
    choices.push({
      description: formatAuthSummary(state),
      label: "Keep current auth",
      value: "keep",
    });
  }

  choices.push({
    description: "Recommended for long-running sync, web, and automation",
    label: "Save Personal API key",
    value: "api-key",
  });
  choices.push({
    description: "Reuse the Granola desktop app session from supabase.json",
    label: "Import desktop session",
    value: "desktop",
  });
  choices.push({
    description: "Open the workspace now and finish connection later",
    label: "Skip for now",
    value: "skip",
  });

  return choices;
}

async function runAuthSetup(
  app: GranolaApp,
  prompt: GuidedSetupPrompter,
  log: typeof console.log,
): Promise<GranolaAppAuthState> {
  let authState = await app.inspectAuth();
  const defaultChoice: GuidedSetupAuthChoice = hasConfiguredAuth(authState) ? "keep" : "api-key";

  while (true) {
    log("");
    const choice = await askChoice(
      prompt,
      log,
      "How should Gran connect to Granola?",
      authChoices(authState),
      defaultChoice,
    );

    if (choice === "keep") {
      log(formatAuthSummary(authState));
      return authState;
    }

    if (choice === "skip") {
      log("Skipping connection setup for now.");
      return authState;
    }

    try {
      if (choice === "api-key") {
        const apiKey = (await prompt.ask("Paste Personal API key: ")).trim();
        if (!apiKey) {
          log("No API key entered.");
          continue;
        }

        authState = await app.loginAuth({
          apiKey,
        });
        log("Saved Personal API key.");
        log(formatAuthSummary(authState));
        return authState;
      }

      authState = await app.loginAuth();
      log("Imported desktop session from Granola.");
      log(formatAuthSummary(authState));
      return authState;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Could not finish that auth step: ${message}`);
    }
  }
}

function launchContext(
  commandFlags: FlagValues,
  globalFlags: FlagValues,
  configPath: string,
): CommandContext {
  return {
    commandArgs: [],
    commandFlags,
    globalFlags: {
      ...globalFlags,
      config: configPath,
    },
  };
}

export async function runGuidedSetupFlow(
  options: GuidedSetupFlowOptions,
): Promise<GuidedSetupLaunchPlan | undefined> {
  const log = options.log ?? console.log;
  const createAppContext = options.createAppContext ?? createCommandAppContext;
  const { app } = await createAppContext(
    {},
    {
      ...options.globalFlags,
      config: options.configPath,
    },
  );

  log("");
  log("Guided setup");
  log("");

  const surface = await askChoice(
    options.prompt,
    log,
    "Where should Gran open after setup?",
    [
      {
        description: "Recommended. Full browser workspace with settings and review.",
        label: "Browser workspace",
        value: "web",
      },
      {
        description: "Stay in the terminal with the keyboard-first workspace.",
        label: "Terminal workspace",
        value: "tui",
      },
    ],
    "web",
  );

  const authState = await runAuthSetup(app, options.prompt, log);

  if (hasConfiguredAuth(authState)) {
    log("");
    if (await askConfirm(options.prompt, "Import meetings now?", true, log)) {
      try {
        const result = await app.sync({
          foreground: true,
        });
        log(describeSyncResult(result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`Could not import meetings right now: ${message}`);
        const continueToSurface = await askConfirm(
          options.prompt,
          `Open the ${surface === "web" ? "browser" : "terminal"} workspace anyway?`,
          true,
          log,
        );
        if (!continueToSurface) {
          log("Setup finished without opening a workspace.");
          return undefined;
        }
      }
    } else {
      log("Skipping the first import for now.");
    }
  } else {
    log("");
    log("No Gran connection is saved yet. You can finish connection from the workspace.");
  }

  return {
    surface,
  };
}

export async function maybeRunGuidedSetupAfterInit(
  options: MaybeRunGuidedSetupOptions,
): Promise<number | undefined> {
  const interactive = options.interactive ?? canRunGuidedSetupInteractively();
  const log = options.log ?? console.log;
  const launchWeb = options.launchWeb ?? webCommand.run.bind(webCommand);
  const launchTui = options.launchTui ?? tuiCommand.run.bind(tuiCommand);
  const ownsPrompt = !options.prompt;
  const prompt = options.prompt ?? options.promptFactory?.() ?? createReadlineGuidedSetupPrompter();

  if (options.commandFlags["skip-guide"] === true) {
    if (ownsPrompt) {
      await prompt.close();
    }
    return undefined;
  }

  if (!interactive) {
    if (options.commandFlags.guided === true) {
      if (ownsPrompt) {
        await prompt.close();
      }
      throw new Error("guided setup requires an interactive terminal");
    }
    if (ownsPrompt) {
      await prompt.close();
    }
    return undefined;
  }

  try {
    const shouldRun =
      options.commandFlags.guided === true
        ? true
        : await askConfirm(prompt, "Start guided setup now?", true, log);
    if (!shouldRun) {
      return undefined;
    }

    const plan = await runGuidedSetupFlow({
      configPath: options.configPath,
      createAppContext: options.createAppContext,
      globalFlags: options.globalFlags,
      log,
      prompt,
    });

    if (!plan) {
      return 0;
    }

    await prompt.close();

    if (plan.surface === "web") {
      log("Opening the browser workspace…");
      return await launchWeb(
        launchContext(
          {
            restart: true,
          },
          options.globalFlags,
          options.configPath,
        ),
      );
    }

    log("Opening the terminal workspace…");
    return await launchTui(
      launchContext(
        {
          foreground: true,
        },
        options.globalFlags,
        options.configPath,
      ),
    );
  } finally {
    if (ownsPrompt) {
      await prompt.close();
    }
  }
}
