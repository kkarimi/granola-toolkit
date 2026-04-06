import type {
  GranolaAutomationAction,
  GranolaAutomationActionKind,
  GranolaAutomationActionRun,
  GranolaAutomationActionTrigger,
  GranolaAutomationAgentAction,
  GranolaAutomationCommandAction,
  GranolaAutomationExportNotesAction,
  GranolaAutomationExportTranscriptAction,
  GranolaAutomationMatch,
  GranolaAutomationPkmSyncAction,
  GranolaAutomationRule,
  GranolaAutomationSlackMessageAction,
  GranolaAutomationWebhookAction,
  GranolaAutomationWriteFileAction,
} from "./app/index.ts";
import { GranolaCapabilityRegistry } from "./registry.ts";
import type {
  AutomationActionCommandResult,
  AutomationActionContext,
  AutomationActionExecutionHandlers,
  AutomationActionPkmResult,
  AutomationActionSlackResult,
  AutomationActionWebhookResult,
  AutomationActionWriteFileResult,
} from "./automation-actions.ts";

export interface GranolaAutomationActionDefinition {
  clone(action: GranolaAutomationAction): GranolaAutomationAction;
  execute(context: GranolaAutomationActionExecutionContext): Promise<GranolaAutomationActionRun>;
  kind: GranolaAutomationActionKind;
  matchesApprovalSourceAction?(action: GranolaAutomationAction, sourceActionId?: string): boolean;
  trigger(action: GranolaAutomationAction): GranolaAutomationActionTrigger;
}

export interface GranolaAutomationActionExecutionContext {
  action: GranolaAutomationAction;
  actionRunOptions?: {
    rerunOfId?: string;
    runId?: string;
  };
  handlers: AutomationActionExecutionHandlers;
  match: GranolaAutomationMatch;
  rule: GranolaAutomationRule;
  runtimeContext: AutomationActionContext;
}

export type GranolaAutomationActionRegistry = GranolaCapabilityRegistry<
  GranolaAutomationActionKind,
  GranolaAutomationActionDefinition
>;

function cloneStructured<T>(value: T): T {
  return structuredClone(value);
}

function actionName(action: GranolaAutomationAction): string {
  return action.name || action.id;
}

function buildRunId(match: GranolaAutomationMatch, actionId: string): string {
  return `${match.id}:${actionId}`;
}

function baseRun(
  match: GranolaAutomationMatch,
  rule: GranolaAutomationRule,
  action: GranolaAutomationAction,
  startedAt: string,
  context: AutomationActionContext,
  options: {
    rerunOfId?: string;
    runId?: string;
  } = {},
): GranolaAutomationActionRun {
  return {
    actionId: action.id,
    actionKind: action.kind,
    actionName: actionName(action),
    artefactIds: context.artefact ? [context.artefact.id] : undefined,
    eventId: match.eventId,
    eventKind: match.eventKind,
    folders: match.folders.map((folder) => ({ ...folder })),
    id: options.runId ?? buildRunId(match, action.id),
    matchId: match.id,
    matchedAt: match.matchedAt,
    meetingId: match.meetingId,
    meta: {
      sourceActionId:
        action.kind === "command" ||
        action.kind === "pkm-sync" ||
        action.kind === "slack-message" ||
        action.kind === "webhook" ||
        action.kind === "write-file"
          ? action.sourceActionId
          : undefined,
      trigger: context.trigger,
    },
    ruleId: rule.id,
    ruleName: rule.name,
    rerunOfId: options.rerunOfId,
    startedAt,
    status: "completed",
    tags: [...match.tags],
    title: match.title,
    transcriptLoaded: match.transcriptLoaded,
  };
}

function completedRun(
  run: GranolaAutomationActionRun,
  finishedAt: string,
  patch: Partial<GranolaAutomationActionRun> = {},
): GranolaAutomationActionRun {
  return {
    ...run,
    ...patch,
    finishedAt,
    status: "completed",
  };
}

function failedRun(
  run: GranolaAutomationActionRun,
  finishedAt: string,
  error: unknown,
): GranolaAutomationActionRun {
  return {
    ...run,
    error: error instanceof Error ? error.message : String(error),
    finishedAt,
    status: "failed",
  };
}

function skippedRun(
  run: GranolaAutomationActionRun,
  finishedAt: string,
  reason: string,
): GranolaAutomationActionRun {
  return {
    ...run,
    finishedAt,
    result: reason,
    status: "skipped",
  };
}

async function runHandler<T>(
  run: GranolaAutomationActionRun,
  execute: () => Promise<T>,
  handlers: AutomationActionExecutionHandlers,
  onSuccess: (result: T) => Partial<GranolaAutomationActionRun>,
): Promise<GranolaAutomationActionRun> {
  try {
    const result = await execute();
    return completedRun(run, handlers.nowIso(), onSuccess(result));
  } catch (error) {
    return failedRun(run, handlers.nowIso(), error);
  }
}

function createAgentDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "agent",
    clone(action) {
      const typed = action as GranolaAutomationAgentAction;
      return {
        ...typed,
        fallbackHarnessIds: typed.fallbackHarnessIds ? [...typed.fallbackHarnessIds] : undefined,
        pipeline: typed.pipeline ? { ...typed.pipeline } : undefined,
      };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationAgentAction;
      const startedAt = context.handlers.nowIso();
      const run = baseRun(
        context.match,
        context.rule,
        action,
        startedAt,
        context.runtimeContext,
        context.actionRunOptions,
      );

      try {
        const result = await context.handlers.runAgent(context.match, context.rule, action, run);
        return completedRun(run, context.handlers.nowIso(), {
          artefactIds: result.artefactIds ? [...result.artefactIds] : undefined,
          meta: {
            attempts: result.attempts,
            artefactIds: result.artefactIds,
            command: result.command,
            dryRun: result.dryRun,
            model: result.model,
            pipelineKind: result.pipelineKind,
            provider: result.provider,
            systemPrompt: result.systemPrompt,
          },
          prompt: result.prompt,
          result: result.output ?? (result.dryRun ? "Dry run: provider request not executed" : ""),
        });
      } catch (error) {
        return failedRun(run, context.handlers.nowIso(), error);
      }
    },
    trigger() {
      return "match";
    },
  };
}

function createAskUserDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "ask-user",
    clone(action) {
      return { ...action };
    },
    async execute(context) {
      const action = context.action;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );
      return {
        ...run,
        meta:
          action.kind === "ask-user" && action.details ? { details: action.details } : undefined,
        prompt: action.kind === "ask-user" ? action.prompt : undefined,
        result: "Pending user decision",
        status: "pending",
      };
    },
    trigger() {
      return "match";
    },
  };
}

function createCommandDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "command",
    clone(action) {
      const typed = action as GranolaAutomationCommandAction;
      return {
        ...typed,
        args: typed.args ? [...typed.args] : undefined,
        env: typed.env ? { ...typed.env } : undefined,
      };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationCommandAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      return await runHandler<AutomationActionCommandResult>(
        run,
        async () =>
          await context.handlers.runCommand(
            context.match,
            context.rule,
            action,
            context.runtimeContext,
          ),
        context.handlers,
        (result) => ({
          meta: {
            ...(run.meta ? cloneStructured(run.meta) : {}),
            command: result.command,
            cwd: result.cwd,
          },
          result: result.output,
        }),
      );
    },
    matchesApprovalSourceAction(action, sourceActionId) {
      const typed = action as GranolaAutomationCommandAction;
      return !sourceActionId || typed.sourceActionId === sourceActionId;
    },
    trigger(action) {
      return (action as GranolaAutomationCommandAction).trigger ?? "match";
    },
  };
}

function createExportNotesDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "export-notes",
    clone(action) {
      return { ...action };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationExportNotesAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      try {
        const result = await context.handlers.exportNotes(context.match, action);
        if (!result) {
          return skippedRun(
            run,
            context.handlers.nowIso(),
            "Meeting notes were unavailable for export",
          );
        }

        return completedRun(run, context.handlers.nowIso(), {
          meta: {
            format: result.format,
            outputDir: result.outputDir,
            scope: result.scope,
            written: result.written,
          },
          result: `Exported notes to ${result.outputDir}`,
        });
      } catch (error) {
        return failedRun(run, context.handlers.nowIso(), error);
      }
    },
    trigger() {
      return "match";
    },
  };
}

function createExportTranscriptDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "export-transcript",
    clone(action) {
      return { ...action };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationExportTranscriptAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      try {
        const result = await context.handlers.exportTranscripts(context.match, action);
        if (!result) {
          return skippedRun(
            run,
            context.handlers.nowIso(),
            "Transcript data was unavailable for export",
          );
        }

        return completedRun(run, context.handlers.nowIso(), {
          meta: {
            format: result.format,
            outputDir: result.outputDir,
            scope: result.scope,
            written: result.written,
          },
          result: `Exported transcript to ${result.outputDir}`,
        });
      } catch (error) {
        return failedRun(run, context.handlers.nowIso(), error);
      }
    },
    trigger() {
      return "match";
    },
  };
}

function createSlackDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "slack-message",
    clone(action) {
      return { ...action };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationSlackMessageAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      return await runHandler<AutomationActionSlackResult>(
        run,
        async () =>
          await context.handlers.runSlackMessage(
            context.match,
            context.rule,
            action,
            context.runtimeContext,
          ),
        context.handlers,
        (result) => ({
          meta: {
            ...(run.meta ? cloneStructured(run.meta) : {}),
            status: result.status,
            text: result.text,
            url: result.url,
          },
          result: result.output ?? `Posted Slack message (${result.status})`,
        }),
      );
    },
    matchesApprovalSourceAction(action, sourceActionId) {
      const typed = action as GranolaAutomationSlackMessageAction;
      return !sourceActionId || typed.sourceActionId === sourceActionId;
    },
    trigger(action) {
      return (action as GranolaAutomationSlackMessageAction).trigger ?? "match";
    },
  };
}

function createPkmDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "pkm-sync",
    clone(action) {
      return { ...action };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationPkmSyncAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      return await runHandler<AutomationActionPkmResult>(
        run,
        async () =>
          await context.handlers.runPkmSync(
            context.match,
            context.rule,
            action,
            context.runtimeContext,
          ),
        context.handlers,
        (result) => ({
          meta: {
            ...(run.meta ? cloneStructured(run.meta) : {}),
            filePath: result.filePath,
            targetId: result.targetId,
          },
          result: `Synced PKM target ${result.targetId} to ${result.filePath}`,
        }),
      );
    },
    matchesApprovalSourceAction(action, sourceActionId) {
      const typed = action as GranolaAutomationPkmSyncAction;
      return !sourceActionId || typed.sourceActionId === sourceActionId;
    },
    trigger(action) {
      return (action as GranolaAutomationPkmSyncAction).trigger ?? "match";
    },
  };
}

function createWebhookDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "webhook",
    clone(action) {
      const typed = action as GranolaAutomationWebhookAction;
      return {
        ...typed,
        headers: typed.headers ? { ...typed.headers } : undefined,
      };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationWebhookAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      return await runHandler<AutomationActionWebhookResult>(
        run,
        async () =>
          await context.handlers.runWebhook(
            context.match,
            context.rule,
            action,
            context.runtimeContext,
          ),
        context.handlers,
        (result) => ({
          meta: {
            ...(run.meta ? cloneStructured(run.meta) : {}),
            status: result.status,
            url: result.url,
          },
          result: result.output ?? `Posted webhook (${result.status})`,
        }),
      );
    },
    matchesApprovalSourceAction(action, sourceActionId) {
      const typed = action as GranolaAutomationWebhookAction;
      return !sourceActionId || typed.sourceActionId === sourceActionId;
    },
    trigger(action) {
      return (action as GranolaAutomationWebhookAction).trigger ?? "match";
    },
  };
}

function createWriteFileDefinition(): GranolaAutomationActionDefinition {
  return {
    kind: "write-file",
    clone(action) {
      return { ...action };
    },
    async execute(context) {
      const action = context.action as GranolaAutomationWriteFileAction;
      const run = baseRun(
        context.match,
        context.rule,
        action,
        context.handlers.nowIso(),
        context.runtimeContext,
        context.actionRunOptions,
      );

      return await runHandler<AutomationActionWriteFileResult>(
        run,
        async () =>
          await context.handlers.writeFile(
            context.match,
            context.rule,
            action,
            context.runtimeContext,
          ),
        context.handlers,
        (result) => ({
          meta: {
            ...(run.meta ? cloneStructured(run.meta) : {}),
            bytes: result.bytes,
            filePath: result.filePath,
            format: result.format,
          },
          result: `Wrote ${result.format} file to ${result.filePath}`,
        }),
      );
    },
    matchesApprovalSourceAction(action, sourceActionId) {
      const typed = action as GranolaAutomationWriteFileAction;
      return !sourceActionId || typed.sourceActionId === sourceActionId;
    },
    trigger(action) {
      return (action as GranolaAutomationWriteFileAction).trigger ?? "match";
    },
  };
}

export function createGranolaAutomationActionRegistry(): GranolaAutomationActionRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaAutomationActionRegistry(): GranolaAutomationActionRegistry {
  return createGranolaAutomationActionRegistry()
    .register("agent", createAgentDefinition())
    .register("ask-user", createAskUserDefinition())
    .register("command", createCommandDefinition())
    .register("export-notes", createExportNotesDefinition())
    .register("export-transcript", createExportTranscriptDefinition())
    .register("pkm-sync", createPkmDefinition())
    .register("slack-message", createSlackDefinition())
    .register("webhook", createWebhookDefinition())
    .register("write-file", createWriteFileDefinition());
}
