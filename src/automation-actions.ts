import type {
  GranolaAutomationAction,
  GranolaAutomationAgentAction,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactAttempt,
  GranolaAutomationActionRun,
  GranolaAutomationActionTrigger,
  GranolaAutomationCommandAction,
  GranolaAutomationExportNotesAction,
  GranolaAutomationExportTranscriptAction,
  GranolaAutomationMatch,
  GranolaAutomationPkmSyncAction,
  GranolaAutomationRule,
  GranolaAutomationSlackMessageAction,
  GranolaAutomationWebhookAction,
  GranolaAutomationWriteFileAction,
  GranolaExportScope,
} from "./app/index.ts";
import {
  buildYazdApprovalWorkflowRunId,
  buildYazdWorkflowRunId,
  yazdWorkflowActionName,
} from "@kkarimi/yazd-core";
import {
  createDefaultGranolaAutomationActionRegistry,
  type GranolaAutomationActionRegistry,
} from "./automation-action-registry.ts";

const defaultAutomationActionRegistry = createDefaultGranolaAutomationActionRegistry();

export function automationActionName(action: GranolaAutomationAction): string {
  return yazdWorkflowActionName(action);
}

export function automationActionTrigger(
  action: GranolaAutomationAction,
  registry: GranolaAutomationActionRegistry = defaultAutomationActionRegistry,
): GranolaAutomationActionTrigger {
  return registry.resolve(action.kind, "automation action").trigger(action);
}

export function buildAutomationActionRunId(
  match: GranolaAutomationMatch,
  actionId: string,
): string {
  return buildYazdWorkflowRunId(match.id, actionId);
}

export function buildAutomationApprovalActionRunId(
  artefact: GranolaAutomationArtefact,
  actionId: string,
): string {
  return buildYazdApprovalWorkflowRunId(artefact.id, actionId);
}

export function enabledAutomationActions(
  rule: GranolaAutomationRule,
  options: {
    registry?: GranolaAutomationActionRegistry;
    sourceActionId?: string;
    trigger?: GranolaAutomationActionTrigger;
  } = {},
): GranolaAutomationAction[] {
  const registry = options.registry ?? defaultAutomationActionRegistry;
  return (rule.actions ?? [])
    .filter((action) => action.enabled !== false)
    .filter((action) => automationActionTrigger(action, registry) === (options.trigger ?? "match"))
    .filter((action) => {
      if (options.trigger !== "approval") {
        return true;
      }

      return (
        registry
          .resolve(action.kind, "automation action")
          .matchesApprovalSourceAction?.(action, options.sourceActionId) ?? false
      );
    })
    .map((action) => registry.resolve(action.kind, "automation action").clone(action));
}

export interface AutomationActionCommandResult {
  command: string;
  cwd?: string;
  output?: string;
}

export interface AutomationActionContext {
  artefact?: GranolaAutomationArtefact;
  decision?: "approve" | "reject";
  note?: string;
  trigger: GranolaAutomationActionTrigger;
}

export interface AutomationActionAgentResult {
  artefactIds?: string[];
  attempts?: GranolaAutomationArtefactAttempt[];
  command?: string;
  dryRun: boolean;
  model: string;
  output?: string;
  pipelineKind?: string;
  prompt: string;
  provider: string;
  systemPrompt?: string;
}

export interface AutomationActionExportResult {
  format: string;
  outputDir: string;
  scope: GranolaExportScope;
  written: number;
}

export interface AutomationActionPkmResult {
  dailyNoteFilePath?: string;
  dailyNoteOpenUrl?: string;
  filePath: string;
  noteOpenUrl?: string;
  targetId: string;
  transcriptFilePath?: string;
  transcriptOpenUrl?: string;
}

export interface AutomationActionSlackResult {
  output?: string;
  status: number;
  text: string;
  url: string;
}

export interface AutomationActionWebhookResult {
  output?: string;
  status: number;
  url: string;
}

export interface AutomationActionWriteFileResult {
  bytes: number;
  filePath: string;
  format: string;
}

export interface AutomationActionExecutionHandlers {
  exportNotes(
    match: GranolaAutomationMatch,
    action: GranolaAutomationExportNotesAction,
  ): Promise<AutomationActionExportResult | undefined>;
  exportTranscripts(
    match: GranolaAutomationMatch,
    action: GranolaAutomationExportTranscriptAction,
  ): Promise<AutomationActionExportResult | undefined>;
  nowIso(): string;
  runAgent(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationAgentAction,
    run: GranolaAutomationActionRun,
  ): Promise<AutomationActionAgentResult>;
  runCommand(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationCommandAction,
    context: AutomationActionContext,
  ): Promise<AutomationActionCommandResult>;
  runPkmSync(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationPkmSyncAction,
    context: AutomationActionContext,
  ): Promise<AutomationActionPkmResult>;
  runSlackMessage(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationSlackMessageAction,
    context: AutomationActionContext,
  ): Promise<AutomationActionSlackResult>;
  runWebhook(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationWebhookAction,
    context: AutomationActionContext,
  ): Promise<AutomationActionWebhookResult>;
  writeFile(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationWriteFileAction,
    context: AutomationActionContext,
  ): Promise<AutomationActionWriteFileResult>;
}

export async function executeAutomationAction(
  match: GranolaAutomationMatch,
  rule: GranolaAutomationRule,
  action: GranolaAutomationAction,
  handlers: AutomationActionExecutionHandlers,
  options: {
    context?: AutomationActionContext;
    registry?: GranolaAutomationActionRegistry;
    rerunOfId?: string;
    runId?: string;
  } = {},
): Promise<GranolaAutomationActionRun> {
  const registry = options.registry ?? defaultAutomationActionRegistry;
  const runtimeContext: AutomationActionContext = options.context ?? {
    trigger: automationActionTrigger(action, registry),
  };

  return await registry.resolve(action.kind, "automation action").execute({
    action,
    actionRunOptions: {
      rerunOfId: options.rerunOfId,
      runId: options.runId,
    },
    handlers,
    match,
    rule,
    runtimeContext,
  });
}
