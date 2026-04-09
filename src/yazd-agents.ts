import type { YazdAgentPlugin, YazdAgentTask } from "@kkarimi/yazd-core";

import { granolaAgentProviderLabel } from "./agent-defaults.ts";
import {
  createDefaultAutomationAgentRunner,
  type CodexCommandRequest,
  type CodexCommandResult,
  type GranolaAutomationAgentRunner,
} from "./agents.ts";
import type { FetchLike } from "./client/http.ts";
import type { AppConfig, GranolaAgentProviderKind } from "./types.ts";
import type { GranolaAgentProviderRegistry } from "./agent-provider-registry.ts";

function trimString(value: string | undefined): string | undefined {
  return value?.trim() ? value.trim() : undefined;
}

function attachmentHeading(task: YazdAgentTask, index: number): string {
  const attachment = task.attachments?.[index];
  if (!attachment) {
    return `Attachment ${String(index + 1)}`;
  }

  const label =
    trimString(attachment.label) ?? trimString(attachment.id) ?? `Attachment ${index + 1}`;
  const contentType = trimString(attachment.contentType);
  return contentType ? `${label} (${contentType})` : label;
}

export function buildGranolaYazdAgentPrompt(task: YazdAgentTask): string {
  const prompt = task.prompt.trim();
  const attachments =
    task.attachments
      ?.map((attachment, index) => {
        const text = trimString(attachment.text);
        if (!text) {
          return undefined;
        }

        return `### ${attachmentHeading(task, index)}\n${text}`;
      })
      .filter((value): value is string => Boolean(value)) ?? [];

  if (attachments.length === 0) {
    return prompt;
  }

  return `${prompt}\n\nContext attachments:\n\n${attachments.join("\n\n")}`;
}

export interface GranolaYazdAgentPluginOptions {
  config: AppConfig;
  cwd?: string;
  description?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  id?: string;
  label?: string;
  provider: GranolaAgentProviderKind;
  providerRegistry?: GranolaAgentProviderRegistry;
  runCodexCommand?: (request: CodexCommandRequest) => Promise<CodexCommandResult>;
  runner?: GranolaAutomationAgentRunner;
}

export function createGranolaYazdAgentPlugin(
  options: GranolaYazdAgentPluginOptions,
): YazdAgentPlugin {
  const runner =
    options.runner ??
    createDefaultAutomationAgentRunner(options.config, {
      env: options.env,
      fetchImpl: options.fetchImpl,
      providerRegistry: options.providerRegistry,
      runCodexCommand: options.runCodexCommand,
    });
  const providerLabel = granolaAgentProviderLabel(options.provider);

  return {
    description:
      options.description ??
      `Run Yazd agent tasks through Gran using the ${providerLabel} provider.`,
    id: options.id ?? `gran/${options.provider}`,
    label: options.label ?? `Gran via ${providerLabel}`,
    async run(task) {
      const result = await runner.run({
        cwd: options.cwd,
        model: task.model,
        prompt: buildGranolaYazdAgentPrompt(task),
        provider: options.provider,
        systemPrompt: task.systemPrompt,
      });

      return {
        markdown: result.output,
        model: result.model,
        text: result.output,
      };
    },
  };
}

export function listGranolaYazdAgentPlugins(
  config: AppConfig,
  options: Omit<GranolaYazdAgentPluginOptions, "config" | "provider"> = {},
): YazdAgentPlugin[] {
  const providers: GranolaAgentProviderKind[] = ["codex", "openai", "openrouter"];
  return providers.map((provider) =>
    createGranolaYazdAgentPlugin({
      ...options,
      config,
      provider,
    }),
  );
}
