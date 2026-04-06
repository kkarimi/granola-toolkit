import type { AppConfig, GranolaAgentProviderKind } from "./types.ts";
import {
  createDefaultGranolaAgentProviderRegistry,
  type GranolaAgentProviderRegistry,
} from "./agent-provider-registry.ts";
import type { FetchLike } from "./client/http.ts";

const DEFAULT_CODEX_MODEL = "gpt-5-codex";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5-mini";

function trimString(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

export interface GranolaAutomationAgentRequest {
  cwd?: string;
  dryRun?: boolean;
  model?: string;
  prompt: string;
  provider?: GranolaAgentProviderKind;
  retries?: number;
  systemPrompt?: string;
  timeoutMs?: number;
}

export interface GranolaAutomationAgentResult {
  command?: string;
  dryRun: boolean;
  model: string;
  output?: string;
  prompt: string;
  provider: GranolaAgentProviderKind;
  systemPrompt?: string;
}

export interface GranolaAutomationAgentRunner {
  run(request: GranolaAutomationAgentRequest): Promise<GranolaAutomationAgentResult>;
}

export interface CodexCommandRequest {
  command: string;
  cwd?: string;
  model?: string;
  prompt: string;
  timeoutMs: number;
}

export interface CodexCommandResult {
  command: string;
  output?: string;
}

function resolveProvider(
  request: GranolaAutomationAgentRequest,
  config: AppConfig,
  env: NodeJS.ProcessEnv,
): GranolaAgentProviderKind {
  if (request.provider) {
    return request.provider;
  }

  if (config.agents?.defaultProvider) {
    return config.agents.defaultProvider;
  }

  if (trimString(env.OPENROUTER_API_KEY) || trimString(env.GRANOLA_OPENROUTER_API_KEY)) {
    return "openrouter";
  }

  if (trimString(env.OPENAI_API_KEY) || trimString(env.GRANOLA_OPENAI_API_KEY)) {
    return "openai";
  }

  return "codex";
}

function resolveModel(
  provider: GranolaAgentProviderKind,
  request: GranolaAutomationAgentRequest,
  config: AppConfig,
): string {
  return (
    trimString(request.model) ??
    trimString(config.agents?.defaultModel) ??
    (provider === "openrouter"
      ? DEFAULT_OPENROUTER_MODEL
      : provider === "openai"
        ? DEFAULT_OPENAI_MODEL
        : DEFAULT_CODEX_MODEL)
  );
}

function resolveTimeoutMs(request: GranolaAutomationAgentRequest, config: AppConfig): number {
  return request.timeoutMs ?? config.agents?.timeoutMs ?? 300_000;
}

function resolveRetries(request: GranolaAutomationAgentRequest, config: AppConfig): number {
  return request.retries ?? config.agents?.maxRetries ?? 2;
}

function resolveDryRun(request: GranolaAutomationAgentRequest, config: AppConfig): boolean {
  return request.dryRun ?? config.agents?.dryRun ?? false;
}

export function createDefaultAutomationAgentRunner(
  config: AppConfig,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike;
    providerRegistry?: GranolaAgentProviderRegistry;
    runCodexCommand?: (request: CodexCommandRequest) => Promise<CodexCommandResult>;
  } = {},
): GranolaAutomationAgentRunner {
  const env = options.env ?? process.env;
  const providerRegistry =
    options.providerRegistry ??
    createDefaultGranolaAgentProviderRegistry(config, {
      env,
      fetchImpl: options.fetchImpl,
      runCodexCommand: options.runCodexCommand,
    });

  return {
    async run(request) {
      const provider = resolveProvider(request, config, env);
      const model = resolveModel(provider, request, config);
      const timeoutMs = resolveTimeoutMs(request, config);
      const retries = resolveRetries(request, config);
      const dryRun = resolveDryRun(request, config);

      if (dryRun) {
        return {
          dryRun,
          model,
          output: undefined,
          prompt: request.prompt,
          provider,
          systemPrompt: request.systemPrompt,
        };
      }

      const providerHandler = providerRegistry.resolve(provider, "agent provider");
      const result = await providerHandler.run({
        config,
        env,
        fetchImpl: options.fetchImpl,
        model,
        request,
        retries,
        timeoutMs,
      });

      return {
        command: result.command,
        dryRun,
        model,
        output: result.output,
        prompt: request.prompt,
        provider,
        systemPrompt: request.systemPrompt,
      };
    },
  };
}
