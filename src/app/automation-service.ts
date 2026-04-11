import {
  explainAgentHarnesses,
  matchAgentHarnesses,
  resolveAgentHarness,
  type AgentHarnessStore,
  type GranolaAgentHarness,
} from "../agent-harnesses.ts";
import {
  createDefaultAutomationAgentRunner,
  type GranolaAutomationAgentRequest,
  type GranolaAutomationAgentRunner,
} from "../agents.ts";
import type { GranolaAgentProviderRegistry } from "../agent-provider-registry.ts";
import {
  automationActionName,
  buildAutomationActionRunId,
  buildAutomationApprovalActionRunId,
  enabledAutomationActions,
  executeAutomationAction,
  type AutomationActionAgentResult,
  type AutomationActionExecutionHandlers,
} from "../automation-actions.ts";
import type { GranolaAutomationActionRegistry } from "../automation-action-registry.ts";
import type { AutomationArtefactStore } from "../automation-artefacts.ts";
import type { AutomationMatchStore } from "../automation-matches.ts";
import type { AutomationRunStore } from "../automation-runs.ts";
import { matchAutomationRules, type AutomationRuleStore } from "../automation-rules.ts";
import {
  buildProcessingIssues,
  collectPipelineRecoveryContexts,
  parseProcessingIssueId,
} from "../processing-health.ts";
import type { GranolaIntelligencePreset } from "../intelligence-presets.ts";
import { parsePipelineOutput } from "../processing.ts";
import type { AppConfig } from "../types.ts";

import type { MeetingSummaryRecord } from "./models.ts";
import {
  cloneAutomationArtefact,
  cloneAutomationMatch,
  cloneAutomationRun,
  type GranolaAutomationStateRepository,
  GranolaAutomationStateRepository as AutomationStateRepository,
} from "./automation-state.ts";
import type {
  GranolaAgentHarnessExplanationsResult,
  GranolaAgentHarnessesResult,
  GranolaAppState,
  GranolaAppSyncEvent,
  GranolaAppSyncState,
  GranolaAutomationAgentAction,
  GranolaAutomationApprovalMode,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactAttempt,
  GranolaAutomationArtefactHistoryAction,
  GranolaAutomationArtefactHistoryEntry,
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactListOptions,
  GranolaAutomationArtefactUpdate,
  GranolaAutomationArtefactsResult,
  GranolaAutomationEvaluationCase,
  GranolaAutomationEvaluationResult,
  GranolaAutomationMatch,
  GranolaAutomationMatchesResult,
  GranolaAutomationPkmSyncAction,
  GranolaAutomationRule,
  GranolaAutomationRulesResult,
  GranolaAutomationRunsResult,
  GranolaMeetingBundle,
  GranolaProcessingIssue,
  GranolaProcessingIssuesResult,
  GranolaProcessingIssueSeverity,
  GranolaProcessingRecoveryResult,
  GranolaSyncEventKind,
} from "./types.ts";

interface ResolvedAutomationAgentAttempt {
  harness?: GranolaAgentHarness;
  prompt: string;
  request: GranolaAutomationAgentRequest;
  systemPrompt?: string;
}

interface GranolaAutomationServiceHandlers extends Pick<
  AutomationActionExecutionHandlers,
  | "exportNotes"
  | "exportTranscripts"
  | "runCommand"
  | "runPkmSync"
  | "runSlackMessage"
  | "runWebhook"
  | "writeFile"
> {
  prepareAgentAttempt(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationAgentAction,
    bundle: GranolaMeetingBundle | undefined,
    harness: GranolaAgentHarness | undefined,
  ): Promise<ResolvedAutomationAgentAttempt>;
}

interface GranolaAutomationServiceDependencies {
  agentHarnessStore?: AgentHarnessStore;
  agentProviderRegistry?: GranolaAgentProviderRegistry;
  agentRunner?: GranolaAutomationAgentRunner;
  automationActionRegistry?: GranolaAutomationActionRegistry;
  automationArtefactStore?: AutomationArtefactStore;
  automationArtefacts?: GranolaAutomationArtefact[];
  automationMatchStore?: AutomationMatchStore;
  automationMatches?: GranolaAutomationMatch[];
  automationRunStore?: AutomationRunStore;
  automationRuns?: GranolaAutomationActionRun[];
  automationRuleStore?: AutomationRuleStore;
  automationRules?: GranolaAutomationRule[];
  currentMeetingSummaries: () => Promise<MeetingSummaryRecord[]>;
  emitStateUpdate: () => void;
  handlers: GranolaAutomationServiceHandlers;
  maybeReadMeetingBundleById: (
    id: string,
    options?: { requireCache?: boolean },
  ) => Promise<GranolaMeetingBundle | undefined>;
  nowIso: () => string;
  onArtefactsChanged: (artefacts: GranolaAutomationArtefact[]) => Promise<void>;
  readMeetingBundleById: (
    id: string,
    options?: { requireCache?: boolean },
  ) => Promise<GranolaMeetingBundle>;
  state: GranolaAppState;
  config: AppConfig;
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

function defaultHarnessEventKind(bundle: GranolaMeetingBundle): GranolaSyncEventKind {
  return bundle.meeting.meeting.transcriptLoaded ? "transcript.ready" : "meeting.changed";
}

function harnessEvaluationMatch(
  bundle: GranolaMeetingBundle,
  generatedAt: string,
  eventKind = defaultHarnessEventKind(bundle),
): GranolaAutomationMatch {
  const document = bundle.source.document;
  return {
    eventId: `evaluate:${document.id}`,
    eventKind,
    folders: bundle.meeting.meeting.folders.map((folder) => ({ ...folder })),
    id: `evaluate:${document.id}`,
    matchedAt: generatedAt,
    meetingId: document.id,
    ruleId: "automation-evaluation",
    ruleName: "Automation evaluation",
    tags: [...bundle.meeting.meeting.tags],
    title: bundle.meeting.meeting.title || document.title || document.id,
    transcriptLoaded: bundle.meeting.meeting.transcriptLoaded,
  };
}

function buildAutomationArtefactId(runId: string, kind: GranolaAutomationArtefact["kind"]): string {
  return `${kind}:${runId}`;
}

export class GranolaAutomationService {
  #automationState: GranolaAutomationStateRepository;

  constructor(private readonly deps: GranolaAutomationServiceDependencies) {
    this.#automationState = new AutomationStateRepository({
      automationArtefactStore: deps.automationArtefactStore,
      automationArtefacts: deps.automationArtefacts,
      automationMatchStore: deps.automationMatchStore,
      automationMatches: deps.automationMatches,
      automationRunStore: deps.automationRunStore,
      automationRuns: deps.automationRuns,
      automationRuleStore: deps.automationRuleStore,
      automationRules: deps.automationRules,
      config: deps.config,
      emitStateUpdate: deps.emitStateUpdate,
      onArtefactsChanged: deps.onArtefactsChanged,
      state: deps.state,
    });
  }

  artefacts(): GranolaAutomationArtefact[] {
    return this.#automationState.artefacts();
  }

  private async loadAutomationRules(
    options: { forceRefresh?: boolean } = {},
  ): Promise<GranolaAutomationRule[]> {
    return await this.#automationState.loadRules(options);
  }

  private async appendAutomationMatches(matches: GranolaAutomationMatch[]): Promise<void> {
    await this.#automationState.appendMatches(matches);
  }

  private async appendAutomationRuns(runs: GranolaAutomationActionRun[]): Promise<void> {
    await this.#automationState.appendRuns(runs);
  }

  private async writeAutomationArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void> {
    await this.#automationState.writeArtefacts(artefacts);
  }

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

  private async readAutomationArtefactById(
    id: string,
  ): Promise<GranolaAutomationArtefact | undefined> {
    return await this.#automationState.readArtefactById(id);
  }

  private assertMutableAutomationArtefact(artefact: GranolaAutomationArtefact): void {
    if (artefact.status === "superseded") {
      throw new Error(`automation artefact is superseded: ${artefact.id}`);
    }
  }

  private async replaceAutomationArtefact(
    nextArtefact: GranolaAutomationArtefact,
  ): Promise<GranolaAutomationArtefact> {
    return await this.#automationState.replaceArtefact(nextArtefact);
  }

  private createRecoveryRunId(match: GranolaAutomationMatch, actionId: string): string {
    const suffix = this.deps.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "");
    return `recovery:${match.meetingId}:${match.ruleId}:${actionId}:${suffix}`;
  }

  private automationActionHandlers(): AutomationActionExecutionHandlers {
    return {
      exportNotes: async (match, action) => await this.deps.handlers.exportNotes(match, action),
      exportTranscripts: async (match, action) =>
        await this.deps.handlers.exportTranscripts(match, action),
      nowIso: () => this.deps.nowIso(),
      runAgent: async (match, rule, action, run) =>
        await this.runAutomationAgent(match, rule, action, run),
      runCommand: async (match, rule, action, context) =>
        await this.deps.handlers.runCommand(match, rule, action, context),
      runPkmSync: async (match, rule, action, context) =>
        await this.deps.handlers.runPkmSync(match, rule, action, context),
      runSlackMessage: async (match, rule, action, context) =>
        await this.deps.handlers.runSlackMessage(match, rule, action, context),
      runWebhook: async (match, rule, action, context) =>
        await this.deps.handlers.runWebhook(match, rule, action, context),
      writeFile: async (match, rule, action, context) =>
        await this.deps.handlers.writeFile(match, rule, action, context),
    };
  }

  private async currentMeetingSummariesForProcessing(): Promise<MeetingSummaryRecord[]> {
    return (await this.deps.currentMeetingSummaries()).map((meeting) => ({ ...meeting }));
  }

  private async computeProcessingIssues(): Promise<GranolaProcessingIssue[]> {
    const [meetings, rules] = await Promise.all([
      this.currentMeetingSummariesForProcessing(),
      this.loadAutomationRules(),
    ]);
    return buildProcessingIssues({
      artefacts: this.#automationState.artefacts(),
      meetings,
      nowIso: this.deps.nowIso(),
      rules,
      runs: this.#automationState.runs(),
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
          this.automationActionHandlers(),
          {
            registry: this.deps.automationActionRegistry,
            runId: this.createRecoveryRunId(context.match, context.action.id),
          },
        ),
      );
    }

    await this.appendAutomationRuns(runs);
    this.deps.emitStateUpdate();
    return runs.map((run) => cloneAutomationRun(run));
  }

  async listAutomationArtefacts(
    options: GranolaAutomationArtefactListOptions = {},
  ): Promise<GranolaAutomationArtefactsResult> {
    const artefacts = await this.#automationState.listArtefacts(options);
    return {
      artefacts,
    };
  }

  async listAgentHarnesses(): Promise<GranolaAgentHarnessesResult> {
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    return {
      harnesses,
    };
  }

  async saveAgentHarnesses(harnesses: GranolaAgentHarness[]): Promise<GranolaAgentHarnessesResult> {
    if (!this.deps.agentHarnessStore) {
      throw new Error("agent harness store is not configured");
    }

    await this.deps.agentHarnessStore.writeHarnesses(harnesses);
    return await this.listAgentHarnesses();
  }

  async explainAgentHarnesses(meetingId: string): Promise<GranolaAgentHarnessExplanationsResult> {
    const bundle = await this.deps
      .readMeetingBundleById(meetingId, {
        requireCache: true,
      })
      .catch(async () => await this.deps.readMeetingBundleById(meetingId));
    const generatedAt = this.deps.nowIso();
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    const eventKind = defaultHarnessEventKind(bundle);

    return {
      eventKind,
      harnesses: explainAgentHarnesses(harnesses, {
        bundle,
        match: harnessEvaluationMatch(bundle, generatedAt, eventKind),
      }),
      meetingId: bundle.source.document.id,
      meetingTitle:
        bundle.meeting.meeting.title || bundle.source.document.title || bundle.source.document.id,
    };
  }

  async evaluateAutomationCases(
    cases: GranolaAutomationEvaluationCase[],
    options: {
      dryRun?: boolean;
      harnessIds?: string[];
      kind?: GranolaAutomationArtefactKind;
      model?: string;
      provider?: GranolaAutomationAgentAction["provider"];
    } = {},
  ): Promise<GranolaAutomationEvaluationResult> {
    const generatedAt = this.deps.nowIso();
    const kind = options.kind ?? "notes";
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    const runner =
      this.deps.agentRunner ??
      createDefaultAutomationAgentRunner(this.deps.config, {
        providerRegistry: this.deps.agentProviderRegistry,
      });
    const results: GranolaAutomationEvaluationResult["results"] = [];

    for (const evaluationCase of cases) {
      const match = harnessEvaluationMatch(evaluationCase.bundle, generatedAt);
      const selectedHarnesses =
        options.harnessIds && options.harnessIds.length > 0
          ? options.harnessIds.map((harnessId) =>
              resolveAgentHarness(harnesses, { bundle: evaluationCase.bundle, match }, harnessId),
            )
          : matchAgentHarnesses(harnesses, { bundle: evaluationCase.bundle, match });
      const resolvedHarnesses = selectedHarnesses.filter(
        (harness): harness is GranolaAgentHarness => Boolean(harness),
      );

      if (resolvedHarnesses.length === 0) {
        results.push({
          caseId: evaluationCase.id,
          caseTitle: evaluationCase.title,
          error: "No harness matched this fixture case.",
          prompt: "",
          status: "failed",
        });
        continue;
      }

      for (const harness of resolvedHarnesses) {
        const action: GranolaAutomationAgentAction = {
          dryRun: options.dryRun,
          harnessId: harness.id,
          id: `evaluate:${harness.id}`,
          kind: "agent",
          model: options.model,
          pipeline: { kind },
          provider: options.provider,
        };
        const rule: GranolaAutomationRule = {
          id: `evaluate:${harness.id}`,
          name: `Evaluate ${harness.name}`,
          when: {},
        };

        try {
          const attempt = await this.deps.handlers.prepareAgentAttempt(
            match,
            rule,
            action,
            evaluationCase.bundle,
            harness,
          );
          const result = await runner.run(attempt.request);
          const parsed = parsePipelineOutput({
            kind,
            meetingTitle: evaluationCase.title,
            rawOutput: result.output ?? "",
            roleHelpers: evaluationCase.bundle.meeting.roleHelpers,
          });
          results.push({
            caseId: evaluationCase.id,
            caseTitle: evaluationCase.title,
            harnessId: harness.id,
            harnessName: harness.name,
            model: result.model,
            parseMode: parsed.parseMode,
            prompt: result.prompt,
            provider: result.provider,
            rawOutput: result.output ?? "",
            status: "completed",
            structured: parsed.structured,
          });
        } catch (error) {
          results.push({
            caseId: evaluationCase.id,
            caseTitle: evaluationCase.title,
            error: error instanceof Error ? error.message : String(error),
            harnessId: harness.id,
            harnessName: harness.name,
            model: options.model ?? harness.model,
            prompt: "",
            provider: options.provider ?? harness.provider,
            status: "failed",
          });
        }
      }
    }

    return {
      generatedAt,
      kind,
      results,
    };
  }

  async runIntelligencePreset(options: {
    approvalMode?: GranolaAutomationApprovalMode;
    bundles: GranolaMeetingBundle[];
    model?: GranolaAutomationAgentAction["model"];
    preset: GranolaIntelligencePreset;
    provider?: GranolaAutomationAgentAction["provider"];
  }): Promise<{
    artefacts: GranolaAutomationArtefact[];
    runs: GranolaAutomationActionRun[];
  }> {
    const generatedAt = this.deps.nowIso();
    const action: GranolaAutomationAgentAction = {
      approvalMode: options.approvalMode ?? "manual",
      id: `intelligence:${options.preset.id}`,
      kind: "agent",
      model: options.model,
      pipeline: { kind: "enrichment" },
      prompt: options.preset.prompt,
      provider: options.provider,
    };
    const rule: GranolaAutomationRule = {
      id: `intelligence:${options.preset.id}`,
      name: `Intelligence: ${options.preset.label}`,
      when: {},
    };
    const runs: GranolaAutomationActionRun[] = [];

    for (const bundle of options.bundles) {
      const meeting = bundle.meeting.meeting;
      const matchId = `intelligence:${options.preset.id}:${bundle.source.document.id}:${generatedAt}`;
      const match: GranolaAutomationMatch = {
        eventId: matchId,
        eventKind: defaultHarnessEventKind(bundle),
        folders: meeting.folders.map((folder) => ({ ...folder })),
        id: matchId,
        matchedAt: generatedAt,
        meetingId: bundle.source.document.id,
        ruleId: rule.id,
        ruleName: rule.name,
        tags: [...meeting.tags],
        title: meeting.title || bundle.source.document.title || bundle.source.document.id,
        transcriptLoaded: meeting.transcriptLoaded,
      };

      runs.push(
        await executeAutomationAction(match, rule, action, this.automationActionHandlers(), {
          registry: this.deps.automationActionRegistry,
          runId: matchId,
        }),
      );
    }

    await this.appendAutomationRuns(runs);
    this.deps.emitStateUpdate();

    const allArtefacts = this.#automationState.artefacts();
    const artefacts = runs
      .flatMap((run) => run.artefactIds ?? [])
      .map((id) => allArtefacts.find((artefact) => artefact.id === id))
      .filter((artefact): artefact is GranolaAutomationArtefact => Boolean(artefact))
      .map((artefact) => cloneAutomationArtefact(artefact));

    return {
      artefacts,
      runs: runs.map((run) => cloneAutomationRun(run)),
    };
  }

  async getAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    const artefact = await this.readAutomationArtefactById(id);
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

  async listAutomationRules(): Promise<GranolaAutomationRulesResult> {
    const rules = await this.loadAutomationRules({ forceRefresh: true });
    return {
      rules,
    };
  }

  async saveAutomationRules(rules: GranolaAutomationRule[]): Promise<GranolaAutomationRulesResult> {
    const savedRules = await this.#automationState.saveRules(rules);
    return {
      rules: savedRules,
    };
  }

  async listAutomationMatches(
    options: { limit?: number } = {},
  ): Promise<GranolaAutomationMatchesResult> {
    const matches = await this.#automationState.listMatches(options);
    return {
      matches,
    };
  }

  async listAutomationRuns(
    options: { limit?: number; status?: GranolaAutomationActionRun["status"] } = {},
  ): Promise<GranolaAutomationRunsResult> {
    const runs = await this.#automationState.listRuns(options);
    return {
      runs,
    };
  }

  async resolveAutomationRun(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string } = {},
  ): Promise<GranolaAutomationActionRun> {
    const current = await this.#automationState.readRunById(id);
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

    await this.appendAutomationRuns([resolved]);
    this.deps.emitStateUpdate();
    return cloneAutomationRun(resolved);
  }

  private async readAutomationMatchById(id: string): Promise<GranolaAutomationMatch | undefined> {
    return await this.#automationState.readMatchById(id);
  }

  private pipelineApprovalMode(
    action: GranolaAutomationAgentAction,
  ): GranolaAutomationApprovalMode {
    return action.approvalMode ?? "manual";
  }

  private async runPostApprovalActions(
    artefact: GranolaAutomationArtefact,
    options: { decision: "approve" | "reject"; note?: string; targetId?: string },
  ): Promise<GranolaAutomationActionRun[]> {
    if (options.decision !== "approve") {
      return [];
    }

    const rule = (await this.loadAutomationRules({ forceRefresh: true })).find(
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

    const existingRunIds = new Set(this.#automationState.runs().map((run) => run.id));
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
          this.automationActionHandlers(),
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

    await this.appendAutomationRuns(runs);
    this.deps.emitStateUpdate();
    return runs.map((run) => cloneAutomationRun(run));
  }

  async resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string; targetId?: string } = {},
  ): Promise<GranolaAutomationArtefact> {
    const current = await this.readAutomationArtefactById(id);
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

    const replaced = await this.replaceAutomationArtefact(nextArtefact);
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
    const current = await this.readAutomationArtefactById(id);
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

    return await this.replaceAutomationArtefact(nextArtefact);
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
        await this.loadAutomationRules(),
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
      const latestArtefact = this.#automationState
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
      await this.loadAutomationRules(),
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
    const current = await this.readAutomationArtefactById(id);
    if (!current) {
      throw new Error(`automation artefact not found: ${id}`);
    }

    const rules = await this.loadAutomationRules({ forceRefresh: true });
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
      this.automationActionHandlers(),
      {
        registry: this.deps.automationActionRegistry,
        rerunOfId: current.runId,
        runId: `${current.runId}:rerun:${this.deps.nowIso().replaceAll(/[-:.]/g, "").replace("T", "").replace("Z", "")}`,
      },
    );

    await this.appendAutomationRuns([nextRun]);

    const nextArtefactId = nextRun.artefactIds?.[0];
    const currentArtefacts = this.#automationState.artefacts();
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
    await this.writeAutomationArtefacts(updatedArtefacts);
    this.deps.emitStateUpdate();
    return await this.getAutomationArtefact(nextArtefact.id);
  }

  private async runAutomationAgent(
    match: GranolaAutomationMatch,
    rule: GranolaAutomationRule,
    action: GranolaAutomationAgentAction,
    run: GranolaAutomationActionRun,
  ): Promise<AutomationActionAgentResult> {
    const bundle =
      match.eventKind === "meeting.removed"
        ? undefined
        : await this.deps.maybeReadMeetingBundleById(match.meetingId, {
            requireCache: false,
          });
    const harnesses = this.deps.agentHarnessStore
      ? await this.deps.agentHarnessStore.readHarnesses()
      : [];
    const primaryHarness = resolveAgentHarness(harnesses, { bundle, match }, action.harnessId);
    const fallbackHarnessIds = [
      ...(action.fallbackHarnessIds ?? []),
      ...(primaryHarness?.fallbackHarnessIds ?? []),
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
    const attempts = [
      await this.deps.handlers.prepareAgentAttempt(match, rule, action, bundle, primaryHarness),
      ...(await Promise.all(
        fallbackHarnessIds
          .filter((harnessId) => harnessId !== primaryHarness?.id)
          .map(async (harnessId) => {
            const fallbackHarness = resolveAgentHarness(harnesses, { bundle, match }, harnessId);
            return await this.deps.handlers.prepareAgentAttempt(
              match,
              rule,
              action,
              bundle,
              fallbackHarness,
            );
          }),
      )),
    ];
    const runner =
      this.deps.agentRunner ??
      createDefaultAutomationAgentRunner(this.deps.config, {
        providerRegistry: this.deps.agentProviderRegistry,
      });
    const attemptMeta: GranolaAutomationArtefactAttempt[] = [];
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        const result = await runner.run(attempt.request);
        attemptMeta.push({
          harnessId: attempt.harness?.id,
          model: result.model,
          provider:
            result.provider === "codex" ||
            result.provider === "openai" ||
            result.provider === "openrouter"
              ? result.provider
              : undefined,
        });

        if (action.pipeline) {
          const parsed = parsePipelineOutput({
            kind: action.pipeline.kind,
            meetingTitle: match.title,
            rawOutput: result.output ?? "",
            roleHelpers: bundle?.meeting.roleHelpers,
          });
          const createdAt = this.deps.nowIso();
          const artefact: GranolaAutomationArtefact = {
            actionId: action.id,
            actionName: automationActionName(action),
            attempts: attemptMeta.map((item) => ({ ...item })),
            createdAt,
            eventId: match.eventId,
            history: [
              {
                action: "generated",
                at: createdAt,
                note: run.rerunOfId ? `Rerun of ${run.rerunOfId}` : undefined,
              },
            ],
            id: buildAutomationArtefactId(run.id, action.pipeline.kind),
            kind: action.pipeline.kind,
            matchId: match.id,
            meetingId: match.meetingId,
            model: result.model,
            parseMode: parsed.parseMode,
            prompt: result.prompt,
            provider:
              result.provider === "codex" ||
              result.provider === "openai" ||
              result.provider === "openrouter"
                ? result.provider
                : "codex",
            rawOutput: result.output ?? "",
            rerunOfId: run.rerunOfId
              ? buildAutomationArtefactId(run.rerunOfId, action.pipeline.kind)
              : undefined,
            ruleId: rule.id,
            ruleName: rule.name,
            runId: run.id,
            status: "generated",
            structured: parsed.structured,
            updatedAt: createdAt,
          };
          await this.writeAutomationArtefacts([artefact, ...this.#automationState.artefacts()]);
          const finalArtefact =
            this.pipelineApprovalMode(action) === "auto"
              ? await this.resolveAutomationArtefact(artefact.id, "approve", {
                  note: "Auto-approved by automation rule",
                })
              : artefact;

          return {
            artefactIds: [finalArtefact.id],
            attempts: attemptMeta,
            command: result.command,
            dryRun: result.dryRun,
            model: result.model,
            output: parsed.structured.summary ?? parsed.structured.markdown,
            pipelineKind: action.pipeline.kind,
            prompt: result.prompt,
            provider: result.provider,
            systemPrompt: result.systemPrompt,
          };
        }

        return {
          attempts: attemptMeta,
          command: result.command,
          dryRun: result.dryRun,
          model: result.model,
          output: result.output,
          prompt: result.prompt,
          provider: result.provider,
          systemPrompt: result.systemPrompt,
        };
      } catch (error) {
        lastError = error;
        attemptMeta.push({
          error: error instanceof Error ? error.message : String(error),
          harnessId: attempt.harness?.id,
          model: attempt.request.model,
          provider: attempt.request.provider,
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(
          typeof lastError === "string"
            ? lastError
            : lastError
              ? JSON.stringify(lastError)
              : "automation agent failed",
        );
  }

  private async runAutomationActions(
    rules: GranolaAutomationRule[],
    matches: GranolaAutomationMatch[],
  ): Promise<GranolaAutomationActionRun[]> {
    const rulesById = new Map(rules.map((rule) => [rule.id, rule] as const));
    const existingRunIds = new Set(this.#automationState.runs().map((run) => run.id));
    const runs: GranolaAutomationActionRun[] = [];

    for (const match of matches) {
      const rule = rulesById.get(match.ruleId);
      if (!rule) {
        continue;
      }

      for (const action of enabledAutomationActions(rule, {
        registry: this.deps.automationActionRegistry,
      })) {
        const runId = buildAutomationActionRunId(match, action.id);
        if (existingRunIds.has(runId)) {
          continue;
        }

        existingRunIds.add(runId);
        runs.push(
          await executeAutomationAction(match, rule, action, this.automationActionHandlers(), {
            registry: this.deps.automationActionRegistry,
          }),
        );
      }
    }

    await this.appendAutomationRuns(runs);
    return runs.map((run) => cloneAutomationRun(run));
  }

  async processSyncEvents(
    events: GranolaAppSyncEvent[],
    matchedAt: string,
  ): Promise<{
    matches: GranolaAutomationMatch[];
    runs: GranolaAutomationActionRun[];
  }> {
    const rules = await this.loadAutomationRules();
    const automationMatches = matchAutomationRules(rules, events, matchedAt);
    await this.appendAutomationMatches(automationMatches);
    const runs = await this.runAutomationActions(rules, automationMatches);
    return {
      matches: automationMatches.map((match) => cloneAutomationMatch(match)),
      runs,
    };
  }
}
