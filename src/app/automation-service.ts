import type { AgentHarnessStore, GranolaAgentHarness } from "../agent-harnesses.ts";
import type { GranolaAutomationAgentRunner } from "../agents.ts";
import type { GranolaAgentProviderRegistry } from "../agent-provider-registry.ts";
import type { GranolaAutomationActionRegistry } from "../automation-action-registry.ts";
import type { AutomationArtefactStore } from "../automation-artefacts.ts";
import type { AutomationMatchStore } from "../automation-matches.ts";
import type { AutomationRunStore } from "../automation-runs.ts";
import type { AutomationRuleStore } from "../automation-rules.ts";
import type { AppConfig } from "../types.ts";

import type { MeetingSummaryRecord } from "./models.ts";
import { GranolaAutomationEvaluationService } from "./automation-evaluation.ts";
import {
  GranolaAutomationExecutionService,
  type GranolaAutomationExecutionServiceHandlers,
} from "./automation-execution.ts";
import { GranolaAutomationReviewService } from "./automation-review.ts";
import {
  type GranolaAutomationStateRepository,
  GranolaAutomationStateRepository as AutomationStateRepository,
} from "./automation-state.ts";
import type {
  GranolaAgentHarnessExplanationsResult,
  GranolaAgentHarnessesResult,
  GranolaAppState,
  GranolaAppSyncEvent,
  GranolaAutomationAgentAction,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
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
} from "./types.ts";

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
  handlers: GranolaAutomationExecutionServiceHandlers;
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

export class GranolaAutomationService {
  #evaluation: GranolaAutomationEvaluationService;
  #execution: GranolaAutomationExecutionService;
  #review: GranolaAutomationReviewService;
  #automationState: GranolaAutomationStateRepository;

  constructor(private readonly deps: GranolaAutomationServiceDependencies) {
    this.#evaluation = new GranolaAutomationEvaluationService({
      agentHarnessStore: deps.agentHarnessStore,
      agentProviderRegistry: deps.agentProviderRegistry,
      agentRunner: deps.agentRunner,
      config: deps.config,
      handlers: {
        prepareAgentAttempt: async (match, rule, action, bundle, harness) =>
          await this.deps.handlers.prepareAgentAttempt(match, rule, action, bundle, harness),
      },
      nowIso: deps.nowIso,
      readMeetingBundleById: deps.readMeetingBundleById,
    });
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
    this.#execution = new GranolaAutomationExecutionService({
      agentHarnessStore: deps.agentHarnessStore,
      agentProviderRegistry: deps.agentProviderRegistry,
      agentRunner: deps.agentRunner,
      automationActionRegistry: deps.automationActionRegistry,
      automationState: this.#automationState,
      config: deps.config,
      emitStateUpdate: deps.emitStateUpdate,
      handlers: deps.handlers,
      maybeReadMeetingBundleById: deps.maybeReadMeetingBundleById,
      nowIso: deps.nowIso,
      resolveAutomationArtefact: async (id, decision, options) =>
        await this.resolveAutomationArtefact(id, decision, options),
    });
    this.#review = new GranolaAutomationReviewService({
      automationActionRegistry: deps.automationActionRegistry,
      automationState: this.#automationState,
      currentMeetingSummaries: deps.currentMeetingSummaries,
      emitStateUpdate: deps.emitStateUpdate,
      handlers: () => this.#execution.handlers(),
      nowIso: deps.nowIso,
      state: deps.state,
    });
  }

  artefacts(): GranolaAutomationArtefact[] {
    return this.#automationState.artefacts();
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
    return await this.#evaluation.explainAgentHarnesses(meetingId);
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
    return await this.#evaluation.evaluateAutomationCases(cases, options);
  }

  async runIntelligencePreset(
    options: Parameters<GranolaAutomationExecutionService["runIntelligencePreset"]>[0],
  ): Promise<{
    artefacts: GranolaAutomationArtefact[];
    runs: GranolaAutomationActionRun[];
  }> {
    return await this.#execution.runIntelligencePreset(options);
  }

  async processSyncEvents(
    events: GranolaAppSyncEvent[],
    matchedAt: string,
  ): Promise<{
    matches: GranolaAutomationMatch[];
    runs: GranolaAutomationActionRun[];
  }> {
    return await this.#execution.processSyncEvents(events, matchedAt);
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
    const rules = await this.#automationState.loadRules({ forceRefresh: true });
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
}
