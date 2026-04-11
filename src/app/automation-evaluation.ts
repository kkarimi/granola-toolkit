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
import { parsePipelineOutput } from "../processing.ts";
import type { AppConfig } from "../types.ts";

import type {
  GranolaAutomationAgentAction,
  GranolaAutomationArtefactKind,
  GranolaAutomationEvaluationCase,
  GranolaAutomationEvaluationResult,
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaAgentHarnessExplanationsResult,
  GranolaMeetingBundle,
  GranolaSyncEventKind,
} from "./types.ts";

interface ResolvedAutomationAgentAttempt {
  harness?: GranolaAgentHarness;
  prompt: string;
  request: GranolaAutomationAgentRequest;
  systemPrompt?: string;
}

interface GranolaAutomationEvaluationServiceDependencies {
  agentHarnessStore?: AgentHarnessStore;
  agentProviderRegistry?: GranolaAgentProviderRegistry;
  agentRunner?: GranolaAutomationAgentRunner;
  config: AppConfig;
  handlers: {
    prepareAgentAttempt(
      match: GranolaAutomationMatch,
      rule: GranolaAutomationRule,
      action: GranolaAutomationAgentAction,
      bundle: GranolaMeetingBundle | undefined,
      harness: GranolaAgentHarness | undefined,
    ): Promise<ResolvedAutomationAgentAttempt>;
  };
  nowIso: () => string;
  readMeetingBundleById: (
    id: string,
    options?: { requireCache?: boolean },
  ) => Promise<GranolaMeetingBundle>;
}

export function defaultHarnessEventKind(bundle: GranolaMeetingBundle): GranolaSyncEventKind {
  return bundle.meeting.meeting.transcriptLoaded ? "transcript.ready" : "meeting.changed";
}

export function harnessEvaluationMatch(
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

export class GranolaAutomationEvaluationService {
  constructor(private readonly deps: GranolaAutomationEvaluationServiceDependencies) {}

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
}
