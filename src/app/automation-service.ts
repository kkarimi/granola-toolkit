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
import type { GranolaIntelligencePreset } from "../intelligence-presets.ts";
import { parsePipelineOutput } from "../processing.ts";
import type { AppConfig } from "../types.ts";

import type { MeetingSummaryRecord } from "./models.ts";
import { GranolaAutomationReviewService } from "./automation-review.ts";
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
  GranolaAutomationAgentAction,
  GranolaAutomationApprovalMode,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactAttempt,
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactListOptions,
  GranolaAutomationArtefactUpdate,
  GranolaAutomationArtefactsResult,
  GranolaAutomationEvaluationCase,
  GranolaAutomationEvaluationResult,
  GranolaAutomationMatch,
  GranolaAutomationMatchesResult,
  GranolaAutomationRule,
  GranolaAutomationRulesResult,
  GranolaAutomationRunsResult,
  GranolaMeetingBundle,
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
  #review: GranolaAutomationReviewService;
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
    this.#review = new GranolaAutomationReviewService({
      automationActionRegistry: deps.automationActionRegistry,
      automationState: this.#automationState,
      currentMeetingSummaries: deps.currentMeetingSummaries,
      emitStateUpdate: deps.emitStateUpdate,
      handlers: () => this.automationActionHandlers(),
      nowIso: deps.nowIso,
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
    return await this.#review.getAutomationArtefact(id);
  }

  async listProcessingIssues(
    options: {
      limit?: number;
      meetingId?: string;
      severity?: GranolaProcessingIssueSeverity;
    } = {},
  ): Promise<GranolaProcessingIssuesResult> {
    return await this.#review.listProcessingIssues(options);
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
    return await this.#review.resolveAutomationRun(id, decision, options);
  }

  async resolveAutomationArtefact(
    id: string,
    decision: "approve" | "reject",
    options: { note?: string; targetId?: string } = {},
  ): Promise<GranolaAutomationArtefact> {
    return await this.#review.resolveAutomationArtefact(id, decision, options);
  }

  async updateAutomationArtefact(
    id: string,
    patch: GranolaAutomationArtefactUpdate,
  ): Promise<GranolaAutomationArtefact> {
    return await this.#review.updateAutomationArtefact(id, patch);
  }

  async recoverProcessingIssue(id: string): Promise<GranolaProcessingRecoveryResult> {
    return await this.#review.recoverProcessingIssue(id);
  }

  async rerunAutomationArtefact(id: string): Promise<GranolaAutomationArtefact> {
    return await this.#review.rerunAutomationArtefact(id);
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
            (action.approvalMode ?? "manual") === "auto"
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
