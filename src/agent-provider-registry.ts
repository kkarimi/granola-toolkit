import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";

import { CachedTokenProvider } from "./client/auth.ts";
import { AuthenticatedHttpClient, type FetchLike } from "./client/http.ts";
import { GranolaCapabilityRegistry } from "./registry.ts";
import type { AppConfig, GranolaAgentProviderKind } from "./types.ts";
import type {
  CodexCommandRequest,
  CodexCommandResult,
  GranolaAutomationAgentRequest,
  GranolaAutomationAgentResult,
} from "./agents.ts";

const OPENROUTER_REFERER = "https://github.com/kkarimi/granola-toolkit";
const OPENROUTER_TITLE = "granola-toolkit";

function trimString(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function openaiApiKey(env: NodeJS.ProcessEnv): string | undefined {
  return trimString(env.OPENAI_API_KEY) ?? trimString(env.GRANOLA_OPENAI_API_KEY);
}

function openrouterApiKey(env: NodeJS.ProcessEnv): string | undefined {
  return trimString(env.OPENROUTER_API_KEY) ?? trimString(env.GRANOLA_OPENROUTER_API_KEY);
}

async function responseError(response: Response, label: string): Promise<Error> {
  let details = `${response.status} ${response.statusText}`.trim();

  try {
    const payload = (await response.json()) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    if (typeof payload.error === "string" && payload.error.trim()) {
      details = payload.error;
    } else if (
      payload.error &&
      typeof payload.error === "object" &&
      typeof payload.error.message === "string" &&
      payload.error.message.trim()
    ) {
      details = payload.error.message;
    } else if (typeof payload.message === "string" && payload.message.trim()) {
      details = payload.message;
    }
  } catch {
    const text = (await response.text()).trim();
    if (text) {
      details = text;
    }
  }

  return new Error(`${label}: ${details}`);
}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("")
    .trim();
}

async function runCodexCliCommand(request: CodexCommandRequest): Promise<CodexCommandResult> {
  const tempDirectory = await mkdtemp(join(tmpdir(), "granola-toolkit-codex-"));
  const outputFile = join(tempDirectory, "last-message.txt");
  const args = ["exec", "--skip-git-repo-check", "--color", "never"];
  if (request.cwd) {
    args.push("-C", request.cwd);
  }
  if (request.model) {
    args.push("-m", request.model);
  }
  args.push("--output-last-message", outputFile, "-");

  const commandText = [request.command, ...args].join(" ");

  try {
    const output = await new Promise<string | undefined>((resolve, reject) => {
      const child = spawn(request.command, args, {
        cwd: request.cwd ? resolvePath(request.cwd) : process.cwd(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, request.timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", async (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        if (timedOut) {
          reject(new Error(`codex provider timed out after ${request.timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          reject(new Error(stderr || stdout || `codex exited with status ${String(code)}`));
          return;
        }

        try {
          const fileOutput = (await readFile(outputFile, "utf8")).trim();
          resolve(fileOutput || stdout || undefined);
        } catch {
          resolve(stdout || undefined);
        }
      });

      child.stdin.write(request.prompt);
      child.stdin.end();
    });

    return {
      command: commandText,
      output,
    };
  } finally {
    await rm(tempDirectory, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function runOpenAiCompatibleRequest(options: {
  baseUrl: string;
  fetchImpl?: FetchLike;
  headers?: Record<string, string>;
  label: string;
  maxRetries: number;
  model: string;
  prompt: string;
  systemPrompt?: string;
  timeoutMs: number;
  token: string;
}): Promise<string | undefined> {
  const client = new AuthenticatedHttpClient({
    fetchImpl: options.fetchImpl,
    maxRetries: options.maxRetries,
    tokenProvider: new CachedTokenProvider({
      async loadAccessToken() {
        return options.token;
      },
    }),
  });

  const response = await client.postJson(
    `${options.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      messages: [
        ...(options.systemPrompt
          ? [
              {
                content: options.systemPrompt,
                role: "system",
              },
            ]
          : []),
        {
          content: options.prompt,
          role: "user",
        },
      ],
      model: options.model,
    },
    {
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
      timeoutMs: options.timeoutMs,
    },
  );

  if (!response.ok) {
    throw await responseError(response, options.label);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  return messageText(content) || undefined;
}

export interface GranolaAgentProviderExecutionContext {
  config: AppConfig;
  env: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  model: string;
  request: GranolaAutomationAgentRequest;
  retries: number;
  timeoutMs: number;
}

export interface GranolaAgentProviderDefinition {
  kind: GranolaAgentProviderKind;
  run(
    context: GranolaAgentProviderExecutionContext,
  ): Promise<Pick<GranolaAutomationAgentResult, "command" | "output">>;
}

export type GranolaAgentProviderRegistry = GranolaCapabilityRegistry<
  GranolaAgentProviderKind,
  GranolaAgentProviderDefinition
>;

export function createGranolaAgentProviderRegistry(): GranolaAgentProviderRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaAgentProviderRegistry(
  config: AppConfig,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike;
    runCodexCommand?: (request: CodexCommandRequest) => Promise<CodexCommandResult>;
  } = {},
): GranolaAgentProviderRegistry {
  const env = options.env ?? process.env;
  const runCodexCommand = options.runCodexCommand ?? runCodexCliCommand;

  return createGranolaAgentProviderRegistry()
    .register("codex", {
      kind: "codex",
      async run(context) {
        const result = await runCodexCommand({
          command: config.agents?.codexCommand ?? "codex",
          cwd: context.request.cwd,
          model: context.model,
          prompt: context.request.systemPrompt
            ? `${context.request.systemPrompt.trim()}\n\n${context.request.prompt}`
            : context.request.prompt,
          timeoutMs: context.timeoutMs,
        });
        return {
          command: result.command,
          output: result.output,
        };
      },
    })
    .register("openai", {
      kind: "openai",
      async run(context) {
        const token = openaiApiKey(env);
        if (!token) {
          throw new Error(
            "OpenAI API key not found. Set OPENAI_API_KEY or GRANOLA_OPENAI_API_KEY.",
          );
        }

        return {
          output: await runOpenAiCompatibleRequest({
            baseUrl: config.agents?.openaiBaseUrl ?? "https://api.openai.com/v1",
            fetchImpl: options.fetchImpl,
            label: "OpenAI request failed",
            maxRetries: context.retries,
            model: context.model,
            prompt: context.request.prompt,
            systemPrompt: context.request.systemPrompt,
            timeoutMs: context.timeoutMs,
            token,
          }),
        };
      },
    })
    .register("openrouter", {
      kind: "openrouter",
      async run(context) {
        const token = openrouterApiKey(env);
        if (!token) {
          throw new Error(
            "OpenRouter API key not found. Set OPENROUTER_API_KEY or GRANOLA_OPENROUTER_API_KEY.",
          );
        }

        return {
          output: await runOpenAiCompatibleRequest({
            baseUrl: config.agents?.openrouterBaseUrl ?? "https://openrouter.ai/api/v1",
            fetchImpl: options.fetchImpl,
            headers: {
              "HTTP-Referer": OPENROUTER_REFERER,
              "X-Title": OPENROUTER_TITLE,
            },
            label: "OpenRouter request failed",
            maxRetries: context.retries,
            model: context.model,
            prompt: context.request.prompt,
            systemPrompt: context.request.systemPrompt,
            timeoutMs: context.timeoutMs,
            token,
          }),
        };
      },
    });
}
