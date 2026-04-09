import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve as resolvePath } from "node:path";

import type { GranolaAgentHarness } from "./agent-harnesses.ts";
import { defaultGranolaAgentModel } from "./agent-defaults.ts";
import type { GranolaAutomationRule } from "./app/index.ts";
import type { GranolaAgentProviderKind } from "./types.ts";

export interface GranolaProjectInitOptions {
  directory: string;
  force?: boolean;
  model?: string;
  provider: GranolaAgentProviderKind;
}

export interface GranolaProjectInitResult {
  configPath: string;
  createdFiles: string[];
  directory: string;
}

export interface GranolaProjectBootstrapState {
  configPath: string;
  directory: string;
  existingFiles: string[];
  expectedFiles: string[];
  hasAnyFiles: boolean;
  isComplete: boolean;
  missingFiles: string[];
}

const TEAM_PROMPT = `# Team Notes Harness

Turn this meeting into concise internal notes for the team.

Requirements:

- lead with the most important outcome, not a meeting recap
- capture decisions, blockers, risks, and follow-ups
- keep action items concrete and assign them to named people when possible
- prefer the canonical participant names from the meeting context over vague owners like "you"
- call out anything that needs manual follow-up if the transcript is ambiguous
- keep the tone direct and useful for people who did not attend
`;

const CUSTOMER_PROMPT = `# Customer Follow-Up Harness

Turn this meeting into customer-facing follow-up notes for the internal team.

Requirements:

- summarise the customer's goals, requests, and concerns
- capture commitments we made and anything we still owe them
- highlight product feedback, risks, blockers, and dates
- prefer named owners for follow-up actions
- separate confirmed facts from assumptions when the transcript is unclear
- optimise for a quick post-call handoff to sales, success, or product
`;

function defaultModel(provider: GranolaAgentProviderKind, explicitModel?: string): string {
  return defaultGranolaAgentModel(provider, explicitModel);
}

function configTemplate(options: {
  harnessesFile: string;
  model: string;
  pkmTargetsFile: string;
  provider: GranolaAgentProviderKind;
  rulesFile: string;
}): Record<string, unknown> {
  return {
    "agent-provider": options.provider,
    "agent-model": options.model,
    "agent-timeout": "5m",
    "agent-max-retries": 2,
    "agent-harnesses-file": options.harnessesFile,
    "automation-rules-file": options.rulesFile,
    "pkm-targets-file": options.pkmTargetsFile,
    output: "./exports/notes",
    "transcript-output": "./exports/transcripts",
  };
}

function harnessesTemplate(options: {
  customerPromptFile: string;
  model: string;
  provider: GranolaAgentProviderKind;
  teamPromptFile: string;
}): { harnesses: GranolaAgentHarness[] } {
  return {
    harnesses: [
      {
        id: "team-notes",
        match: {
          folderNames: ["Team"],
          transcriptLoaded: true,
        },
        model: options.model,
        name: "Team Notes",
        priority: 50,
        promptFile: options.teamPromptFile,
        provider: options.provider,
      },
      {
        id: "customer-follow-up",
        match: {
          folderNames: ["Customers"],
          transcriptLoaded: true,
        },
        model: options.model,
        name: "Customer Follow-Up",
        priority: 60,
        promptFile: options.customerPromptFile,
        provider: options.provider,
      },
    ],
  };
}

function rulesTemplate(): { rules: GranolaAutomationRule[] } {
  return {
    rules: [
      {
        actions: [
          {
            approvalMode: "manual",
            harnessId: "team-notes",
            id: "team-notes-pipeline",
            kind: "agent",
            name: "Generate team notes",
            pipeline: {
              kind: "notes",
            },
          },
        ],
        id: "team-notes-on-transcript",
        name: "Review team notes when a transcript is ready",
        when: {
          eventKinds: ["transcript.ready"],
          folderNames: ["Team"],
          transcriptLoaded: true,
        },
      },
      {
        actions: [
          {
            approvalMode: "manual",
            harnessId: "customer-follow-up",
            id: "customer-follow-up-pipeline",
            kind: "agent",
            name: "Generate customer follow-up",
            pipeline: {
              kind: "notes",
            },
          },
        ],
        id: "customer-follow-up-on-transcript",
        name: "Review customer follow-up notes when a transcript is ready",
        when: {
          eventKinds: ["transcript.ready"],
          folderNames: ["Customers"],
          transcriptLoaded: true,
        },
      },
    ],
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function projectBootstrapFiles(directory: string) {
  const configPath = join(directory, ".gran.json");
  const projectDirectory = join(directory, ".gran");
  const promptsDirectory = join(projectDirectory, "prompts");
  const teamPromptPath = join(promptsDirectory, "team-notes.md");
  const customerPromptPath = join(promptsDirectory, "customer-follow-up.md");
  const harnessesPath = join(projectDirectory, "agent-harnesses.json");
  const rulesPath = join(projectDirectory, "automation-rules.json");
  const pkmTargetsPath = join(projectDirectory, "pkm-targets.json");

  return {
    configPath,
    files: [
      configPath,
      harnessesPath,
      rulesPath,
      pkmTargetsPath,
      teamPromptPath,
      customerPromptPath,
    ],
    harnessesPath,
    pkmTargetsPath,
    promptsDirectory,
    projectDirectory,
    rulesPath,
    teamPromptPath,
    customerPromptPath,
  };
}

export async function inspectGranolaToolkitProject(
  directory: string,
): Promise<GranolaProjectBootstrapState> {
  const resolvedDirectory = resolvePath(directory);
  const { configPath, files } = projectBootstrapFiles(resolvedDirectory);
  const existingFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const filePath of files) {
    if (await pathExists(filePath)) {
      existingFiles.push(filePath);
    } else {
      missingFiles.push(filePath);
    }
  }

  return {
    configPath,
    directory: resolvedDirectory,
    existingFiles,
    expectedFiles: files,
    hasAnyFiles: existingFiles.length > 0,
    isComplete: missingFiles.length === 0,
    missingFiles,
  };
}

async function ensureWritable(filePaths: string[], force: boolean): Promise<void> {
  if (force) {
    return;
  }

  const existing: string[] = [];
  for (const filePath of filePaths) {
    if (await pathExists(filePath)) {
      existing.push(filePath);
    }
  }

  if (existing.length > 0) {
    throw new Error(
      `init would overwrite existing files:\n${existing.map((filePath) => `- ${filePath}`).join("\n")}\nRe-run with --force to replace them.`,
    );
  }
}

async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function initialiseGranolaToolkitProject(
  options: GranolaProjectInitOptions,
): Promise<GranolaProjectInitResult> {
  const directory = resolvePath(options.directory);
  const {
    configPath,
    files,
    harnessesPath,
    pkmTargetsPath,
    teamPromptPath,
    customerPromptPath,
    rulesPath,
  } = projectBootstrapFiles(directory);
  const provider = options.provider;
  const model = defaultModel(provider, options.model);

  await mkdir(directory, { recursive: true });
  await ensureWritable(files, options.force === true);

  await writeTextFile(
    configPath,
    `${JSON.stringify(
      configTemplate({
        harnessesFile: `./${relative(directory, harnessesPath)}`,
        model,
        pkmTargetsFile: `./${relative(directory, pkmTargetsPath)}`,
        provider,
        rulesFile: `./${relative(directory, rulesPath)}`,
      }),
      null,
      2,
    )}\n`,
  );
  await writeJsonFile(
    harnessesPath,
    harnessesTemplate({
      customerPromptFile: `./${relative(directory, customerPromptPath)}`,
      model,
      provider,
      teamPromptFile: `./${relative(directory, teamPromptPath)}`,
    }),
  );
  await writeJsonFile(rulesPath, rulesTemplate());
  await writeJsonFile(pkmTargetsPath, { targets: [] });
  await writeTextFile(teamPromptPath, TEAM_PROMPT);
  await writeTextFile(customerPromptPath, CUSTOMER_PROMPT);

  return {
    configPath,
    createdFiles: files,
    directory,
  };
}
