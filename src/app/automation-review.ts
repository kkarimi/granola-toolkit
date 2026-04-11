import {
  buildAutomationApprovalActionRunId,
  enabledAutomationActions,
  executeAutomationAction,
  type AutomationActionExecutionHandlers,
} from "../automation-actions.ts";
import type { GranolaAutomationActionRegistry } from "../automation-action-registry.ts";
import {
  buildProcessingIssues,
  collectPipelineRecoveryContexts,
  parseProcessingIssueId,
} from "../processing-health.ts";

import type { MeetingSummaryRecord } from "./models.ts";
import {
  cloneAutomationArtefact,
  cloneAutomationMatch,
  cloneAutomationRun,
  type GranolaAutomationStateRepository,
} from "./automation-state.ts";
import type {
  GranolaAppState,
  GranolaAppSyncState,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactHistoryAction,
  GranolaAutomationArtefactHistoryEntry,
  GranolaAutomationArtefactUpdate,
  GranolaAutomationPkmSyncAction,
  GranolaProcessingIssue,
  GranolaProcessingIssuesResult,
  GranolaProcessingIssueSeverity,
  GranolaProcessingRecoveryResult,
} from "./types.ts";

interface GranolaAutomationReviewServiceDependencies {
  automationActionRegistry?: GranolaAutomationActionRegistry;
  automationState: GranolaAutomationStateRepository;
  currentMeetingSummaries: () => Promise<MeetingSummaryRecord[]>;
  emitStateUpdate: () => void;
  handlers: () => AutomationActionExecutionHandlers;
  nowIso: () => string;
  state: GranolaAppState;
}

function cloneSyncState(state: GranolaAppSyncState): GranolaAppSyncState {
  return {
    ...state,
    lastChanges: state.lastChanges.map((change) => ({ ...change })),
    recentRuns: (state.recentRuns ?? []).map((run) => ({
      ...run,
      changes: run.changes.map((change) => ({ ...change })),
      summary: run.summary ? { ...run.summary } : undefined,
    })),
    summary: state.summary ? { ...state.summary } : undefined,
  };
}

export class GranolaAutomationReviewService {
  constructor(private readonly deps: GranolaAutomationReviewServiceDependencies) {}

  private buildAutomationArtefactHistoryEntry(
    action: GranolaAutomationArtefactHistoryAction,
    note?: string,
  ): GranolaAutomationArtefactHistoryEntry {
    return {
      action,
      at: this.deps.nowIso(),
      note: note?.trim() || undefined,
    };
  }

  private assertMutableAutomationArtefact(artefact: GranolaAutomationArtefact): void {
    if (artefact.status === "superseded") {
      throw new Error(`automation artefact is superseded: ${artefact.id}`);
    }
  }

  private createRecoveryRunId(
    matchId: {
      meetingId: string;
      ruleId: string;
    },
    actionId: string,
  ): string {
    const suffix = this.deps.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "");
    return `recovery:${matchId.meetingId}:${matchId.ruleId}:${actionId}:${suffix}`;
  }

  private async currentMeetingSummariesForProcessing(): Promise<MeetingSummaryRecord[]> {
    return (await this.deps.currentMeetingSummaries()).map((meeting) => ({ ...meeting }));
  }

  private async computeProcessingIssues(): Promise<GranolaProcessingIssue[]> {
    const [meetings, rules] = await Promise.all([
      this.currentMeetingSummariesForProcessing(),
      this.deps.automationState.loadRules(),
    ]);
    return buildProcessingIssues({
      artefacts: this.deps.automationState.artefacts(),
      meetings,
      nowIso: this.deps.nowIso(),
      rules,
      runs: this.deps.automationState.runs(),
      syncState: cloneSyncState(this.deps.state.sync),
    });
  }

  private async rerunPipelineContexts(
    contexts: ReturnType<typeof collectPipelineRecoveryContexts>,
  ): Promise<GranolaAutomationActionRun[]> {
    const runs: GranolaAutomationActionRun[] = [];

    for (const context of contexts) {
      runs.push(
        await executeAutomationAction(
          cloneAutomationMatch(context.match),
          context.rule,
          context.action,
          this.deps.handlers(),
          {
            registry: this.deps.automationActionRegistry,
            runId: this.createRecoveryRunId(context.match, context.action.id),
          },
        ),
      );
    }

    await this.deps.automationState.appendRuns(runs);
    this.deps.emitStateUpdate();
    return runs.map((run) => cloneAutomationRun(run));
  }

  async getAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    const artefact = await this.deps.automationState.readArtefactById(id);
    if (!artefact) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    return cloneAutomationArtefact(artefact);
  }

  async listProcessingIssues(
    options: {
      limit?: number;
      meetingId?: string;
      severity?: GranolaProcessingIssueSeverity;
    } = {},
  ): Promise<GranolaProcessingIssuesResult> {
    const limit = options.limit ?? 20;
    const issues = (await this.computeProcessingIssues())
      .filter((issue) => {
        if (options.meetingId && issue.meetingId !== options.meetingId) {
          return false;
        }
        if (options.severity && issue.severity !== options.severity) {
          return false;
        }
        return true;
      })
      .slice(0, limit);

    return {
      issues: issues.map((issue) => ({ ...issue })),
    };
  }

  async resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string } = {},
  ): Promise<GranolaAutomationActionRun> {
    const current = await this.deps.automationState.readRunById(id);
    if (!current) {
      throw new Error(`automation run not found: ${id}`);
    }

    if (current.status !== "pending") {
      throw new Error(`automation run is not pending: ${id}`);
    }

    const finishedAt = this.deps.nowIso();
    const resolved: GranolaAutomationActionRun = {
      ...cloneAutomationRun(current),
      finishedAt,
      meta: {
        ...(current.meta ? structuredClone(current.meta) : {}),
        decision,
        note: options.note?.trim() || undefined,
      },
      result:
        decision === "approve"
          ? options.note?.trim() || "Approved by user"
          : options.note?.trim() || "Rejected by user",
      status: decision === "approve" ? "completed" : "skipped",
    };

    await this.deps.automationState.appendRuns([resolved]);
    this.deps.emitStateUpdate();
    return cloneAutomationRun(resolved);
  }

  private async readAutomationMatchById(id: string) {
    return await this.deps.automationState.readMatchById(id);
  }

  private async runPostApprovalActions(
    artefact: GranolaAutomationArtefact,
    options: { decision: "approve" | "reject"; note?: string; targetId?: string },
  ): Promise<GranolaAutomationActionRun[]> {
    if (options.decision !== "approve") {
      return [];
    }

    const rule = (await this.deps.automationState.loadRules({ forceRefresh: true })).find(
      (candidate) => candidate.id === artefact.ruleId,
    );
    if (!rule) {
      return [];
    }

    const match = await this.readAutomationMatchById(artefact.matchId);
    if (!match) {
      return [];
    }

    const actions = enabledAutomationActions(rule, {
      registry: this.deps.automationActionRegistry,
      sourceActionId: artefact.actionId,
      trigger: "approval",
    });
    const linkedPkmTargetIds = actions
      .filter(
        (action): action is GranolaAutomationPkmSyncAction =>
          action.kind === "pkm-sync" && Boolean(action.targetId),
      )
      .map((action) => action.targetId);
    if (options.targetId && linkedPkmTargetIds.length === 0) {
      throw new Error("No linked knowledge base is configured for this artefact");
    }
    if (options.targetId && !linkedPkmTargetIds.includes(options.targetId)) {
      throw new Error(`linked knowledge base not found: ${options.targetId}`);
    }
    if (actions.length === 0) {
      return [];
    }

    const existingRunIds = new Set(this.deps.automationState.runs().map((run) => run.id));
    const runs: GranolaAutomationActionRun[] = [];

    for (const action of actions) {
      if (action.kind === "pkm-sync" && options.targetId && action.targetId !== options.targetId) {
        continue;
      }

      const runId = buildAutomationApprovalActionRunId(artefact, action.id);
      if (existingRunIds.has(runId)) {
        continue;
      }

      existingRunIds.add(runId);
      runs.push(
        await executeAutomationAction(
          cloneAutomationMatch(match),
          rule,
          action,
          this.deps.handlers(),
          {
            context: {
              artefact: cloneAutomationArtefact(artefact),
              decision: options.decision,
              note: options.note,
              trigger: "approval",
            },
            registry: this.deps.automationActionRegistry,
            runId,
          },
        ),
      );
    }

    await this.deps.automationState.appendRuns(runs);
    this.deps.emitStateUpdate();
    return runs.map((run) => cloneAutomationRun(run));
  }

  async resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string; targetId?: string } = {},
  ): Promise<GranolaAutomationArtefact> {
    const current = await this.deps.automationState.readArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    this.assertMutableAutomationArtefact(current);
    const shouldRunPostApproval = decision === "approve" && current.status !== "approved";

    const nextArtefact: GranolaAutomationArtefact = {
      ...cloneAutomationArtefact(current),
      history: [
        ...current.history.map((entry) => ({ ...entry })),
        this.buildAutomationArtefactHistoryEntry(
          decision === "approve" ? "approved" : "rejected",
          options.note,
        ),
      ],
      status: decision === "approve" ? "approved" : "rejected",
      updatedAt: this.deps.nowIso(),
    };

    const replaced = await this.deps.automationState.replaceArtefact(nextArtefact);
    if (shouldRunPostApproval) {
      await this.runPostApprovalActions(replaced, {
        decision,
        note: options.note,
        targetId: options.targetId,
      });
    }

    return replaced;
  }

  async updateAutomationArtefact(
    id: string,
    patch: GranolaAutomationArtefactUpdate,
  ): Promise<GranolaAutomationArtefact> {
    const current = await this.deps.automationState.readArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    this.assertMutableAutomationArtefact(current);

    const nextTitle = patch.title?.trim();
    const nextSummary = patch.summary?.trim();
    const nextMarkdown = patch.markdown?.trim();
    if (nextTitle === "" || nextMarkdown === "") {
      throw new Error("automation artefact title and markdown must not be empty");
    }

    const nextArtefact: GranolaAutomationArtefact = {
      ...cloneAutomationArtefact(current),
      history: [
        ...current.history.map((entry) => ({ ...entry })),
        this.buildAutomationArtefactHistoryEntry("edited", patch.note),
      ],
      structured: {
        ...current.structured,
        markdown: nextMarkdown ?? current.structured.markdown,
        summary: nextSummary === undefined ? current.structured.summary : nextSummary || undefined,
        title: nextTitle ?? current.structured.title,
      },
      updatedAt: this.deps.nowIso(),
    };

    return await this.deps.automationState.replaceArtefact(nextArtefact);
  }

  async recoverProcessingIssue(id: string): Promise<GranolaProcessingRecoveryResult> {
    const issue = (await this.computeProcessingIssues()).find((candidate) => candidate.id === id);
    if (!issue) {
      throw new Error(`processing issue not found: ${id}`);
    }

    const parsed = parseProcessingIssueId(id);

    if (parsed.kind === "sync-stale") {
      throw new Error("sync-stale recovery must be handled by the app sync service");
    }

    if (!parsed.meetingId) {
      throw new Error(`processing issue is missing meeting context: ${id}`);
    }

    if (parsed.kind === "transcript-missing") {
      const meetings = await this.currentMeetingSummariesForProcessing();
      const meeting = meetings.find((candidate) => candidate.id === parsed.meetingId);
      if (!meeting?.transcriptLoaded) {
        return {
          issue: { ...issue },
          recoveredAt: this.deps.nowIso(),
          runCount: 0,
          syncRan: true,
        };
      }

      const contexts = collectPipelineRecoveryContexts(
        await this.deps.automationState.loadRules(),
        meeting,
        this.deps.nowIso(),
      );
      const rerunCount = (await this.rerunPipelineContexts(contexts)).length;
      return {
        issue: { ...issue },
        recoveredAt: this.deps.nowIso(),
        runCount: rerunCount,
        syncRan: true,
      };
    }

    const meetings = await this.currentMeetingSummariesForProcessing();
    const meeting = meetings.find((candidate) => candidate.id === parsed.meetingId);
    if (!meeting) {
      throw new Error(`meeting not found for processing issue: ${parsed.meetingId}`);
    }

    if (parsed.kind === "artefact-stale" && parsed.ruleId && parsed.actionId) {
      const latestArtefact = this.deps.automationState
        .artefacts()
        .filter(
          (artefact) =>
            artefact.meetingId === parsed.meetingId &&
            artefact.ruleId === parsed.ruleId &&
            artefact.actionId === parsed.actionId &&
            artefact.status !== "superseded",
        )
        .slice()
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (latestArtefact) {
        await this.rerunAutomationArtefact(latestArtefact.id);
        return {
          issue: { ...issue },
          recoveredAt: this.deps.nowIso(),
          runCount: 1,
          syncRan: false,
        };
      }
    }

    const contexts = collectPipelineRecoveryContexts(
      await this.deps.automationState.loadRules(),
      meeting,
      this.deps.nowIso(),
    ).filter((context) => {
      if (parsed.ruleId && context.rule.id !== parsed.ruleId) {
        return false;
      }
      if (parsed.actionId && context.action.id !== parsed.actionId) {
        return false;
      }
      return true;
    });

    const rerunCount = (await this.rerunPipelineContexts(contexts)).length;
    return {
      issue: { ...issue },
      recoveredAt: this.deps.nowIso(),
      runCount: rerunCount,
      syncRan: false,
    };
  }

  async rerunAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    const current = await this.deps.automationState.readArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    const rules = await this.deps.automationState.loadRules({ forceRefresh: true });
    const rule = rules.find((candidate) => candidate.id === current.ruleId);
    if (!rule) {
      throw new Error(`automation rule not found: ${current.ruleId}`);
    }

    const action = enabledAutomationActions(rule, {
      registry: this.deps.automationActionRegistry,
    }).find((candidate) => candidate.id === current.actionId);
    if (!action || action.kind !== "agent" || !action.pipeline) {
      throw new Error(`automation artefact is not rerunnable: ${id}`);
    }

    const match = await this.readAutomationMatchById(current.matchId);
    if (!match) {
      throw new Error(`automation match not found: ${current.matchId}`);
    }

    const nextRun = await executeAutomationAction(
      cloneAutomationMatch(match),
      rule,
      action,
      this.deps.handlers(),
      {
        registry: this.deps.automationActionRegistry,
        rerunOfId: current.runId,
        runId: `${current.runId}:rerun:${this.deps.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "")}`,
      },
    );

    await this.deps.automationState.appendRuns([nextRun]);

    const nextArtefactId = nextRun.artefactIds?.[0];
    const currentArtefacts = this.deps.automationState.artefacts();
    const nextArtefact = nextArtefactId
      ? currentArtefacts.find((artefact) => artefact.id === nextArtefactId)
      : undefined;
    if (!nextArtefact) {
      throw new Error(`rerun did not produce an automation artefact: ${id}`);
    }

    const updatedArtefacts = currentArtefacts.map((artefact) =>
      artefact.id === current.id
        ? {
            ...artefact,
            history: [
              ...artefact.history.map((entry) => ({ ...entry })),
              this.buildAutomationArtefactHistoryEntry("rerun", `Superseded by ${nextArtefact.id}`),
            ],
            status: "superseded" as const,
            supersededById: nextArtefact.id,
            updatedAt: nextArtefact.createdAt,
          }
        : artefact,
    );
    await this.deps.automationState.writeArtefacts(updatedArtefacts);
    this.deps.emitStateUpdate();
    return await this.getAutomationArtefact(nextArtefact.id);
  }
}
