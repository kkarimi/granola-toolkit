import type {
  GranolaAutomationAction,
  GranolaAutomationActionRun,
  GranolaAutomationCommandAction,
  GranolaAutomationExportNotesAction,
  GranolaAutomationExportTranscriptAction,
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaExportScope,
} from "./app/index.ts";

function cloneAction(action: GranolaAutomationAction): GranolaAutomationAction {
  switch (action.kind) {
    case "ask-user":
      return { ...action };
    case "command":
      return {
        ...action,
        args: action.args ? [...action.args] : undefined,
        env: action.env ? { ...action.env } : undefined,
      };
    case "export-notes":
    case "export-transcript":
      return { ...action };
  }
}

export function automationActionName(action: GranolaAutomationAction): string {
  return action.name || action.id;
}

export function buildAutomationActionRunId(
  match: GranolaAutomationMatch,
  actionId: string,
): string {
  return `${match.id}:${actionId}`;
}

export function enabledAutomationActions(rule: GranolaAutomationRule): GranolaAutomationAction[] {
  return (rule.actions ?? [])
    .filter((action) => action.enabled !== false)
    .map((action) => cloneAction(action));
}

export interface AutomationActionCommandResult {
  command: string;
  cwd?: string;
  output?: string;
}

export interface AutomationActionExportResult {
  format: string;
  outputDir: string;
  scope: GranolaExportScope;
  written: number;
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
  runCommand(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationCommandAction,
  ): Promise<AutomationActionCommandResult>;
}

function baseRun(
  match: GranolaAutomationMatch,
  rule: GranolaAutomationRule,
  action: GranolaAutomationAction,
  startedAt: string,
): GranolaAutomationActionRun {
  return {
    actionId: action.id,
    actionKind: action.kind,
    actionName: automationActionName(action),
    eventId: match.eventId,
    eventKind: match.eventKind,
    folders: match.folders.map((folder) => ({ ...folder })),
    id: buildAutomationActionRunId(match, action.id),
    matchedAt: match.matchedAt,
    meetingId: match.meetingId,
    ruleId: rule.id,
    ruleName: rule.name,
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

export async function executeAutomationAction(
  match: GranolaAutomationMatch,
  rule: GranolaAutomationRule,
  action: GranolaAutomationAction,
  handlers: AutomationActionExecutionHandlers,
): Promise<GranolaAutomationActionRun> {
  const startedAt = handlers.nowIso();
  const run = baseRun(match, rule, action, startedAt);

  switch (action.kind) {
    case "ask-user":
      return {
        ...run,
        meta: action.details ? { details: action.details } : undefined,
        prompt: action.prompt,
        result: "Pending user decision",
        status: "pending",
      };
    case "command":
      try {
        const result = await handlers.runCommand(match, rule, action);
        return completedRun(run, handlers.nowIso(), {
          meta: {
            command: result.command,
            cwd: result.cwd,
          },
          result: result.output,
        });
      } catch (error) {
        return failedRun(run, handlers.nowIso(), error);
      }
    case "export-notes":
      try {
        const result = await handlers.exportNotes(match, action);
        if (!result) {
          return skippedRun(run, handlers.nowIso(), "Meeting notes were unavailable for export");
        }

        return completedRun(run, handlers.nowIso(), {
          meta: {
            format: result.format,
            outputDir: result.outputDir,
            scope: result.scope,
            written: result.written,
          },
          result: `Exported notes to ${result.outputDir}`,
        });
      } catch (error) {
        return failedRun(run, handlers.nowIso(), error);
      }
    case "export-transcript":
      try {
        const result = await handlers.exportTranscripts(match, action);
        if (!result) {
          return skippedRun(run, handlers.nowIso(), "Transcript data was unavailable for export");
        }

        return completedRun(run, handlers.nowIso(), {
          meta: {
            format: result.format,
            outputDir: result.outputDir,
            scope: result.scope,
            written: result.written,
          },
          result: `Exported transcript to ${result.outputDir}`,
        });
      } catch (error) {
        return failedRun(run, handlers.nowIso(), error);
      }
  }
}
