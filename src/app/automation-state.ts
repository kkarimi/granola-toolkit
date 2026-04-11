import { cloneYazdStructuredOutput } from "@kkarimi/yazd-core";

import type { AutomationArtefactStore } from "../automation-artefacts.ts";
import {
  defaultAutomationMatchesFilePath,
  type AutomationMatchStore,
} from "../automation-matches.ts";
import type { AutomationRunStore } from "../automation-runs.ts";
import type { AutomationRuleStore } from "../automation-rules.ts";
import type { AppConfig } from "../types.ts";

import type {
  GranolaAppState,
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaAutomationArtefactListOptions,
  GranolaAutomationMatch,
  GranolaAutomationRule,
} from "./types.ts";

export function cloneAutomationRule(rule: GranolaAutomationRule): GranolaAutomationRule {
  return {
    ...rule,
    actions: rule.actions?.map((action) => {
      switch (action.kind) {
        case "agent":
          return { ...action };
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
        case "pkm-sync":
          return { ...action };
        case "slack-message":
          return { ...action };
        case "webhook":
          return {
            ...action,
            headers: action.headers ? { ...action.headers } : undefined,
          };
        case "write-file":
          return { ...action };
      }
    }),
    when: {
      ...rule.when,
      eventKinds: rule.when.eventKinds ? [...rule.when.eventKinds] : undefined,
      folderIds: rule.when.folderIds ? [...rule.when.folderIds] : undefined,
      folderNames: rule.when.folderNames ? [...rule.when.folderNames] : undefined,
      meetingIds: rule.when.meetingIds ? [...rule.when.meetingIds] : undefined,
      tags: rule.when.tags ? [...rule.when.tags] : undefined,
      titleIncludes: rule.when.titleIncludes ? [...rule.when.titleIncludes] : undefined,
    },
  };
}

export function cloneAutomationMatch(match: GranolaAutomationMatch): GranolaAutomationMatch {
  return {
    ...match,
    folders: match.folders.map((folder) => ({ ...folder })),
    tags: [...match.tags],
  };
}

export function cloneAutomationRun(run: GranolaAutomationActionRun): GranolaAutomationActionRun {
  return {
    ...run,
    artefactIds: run.artefactIds ? [...run.artefactIds] : undefined,
    folders: run.folders.map((folder) => ({ ...folder })),
    meta: run.meta ? structuredClone(run.meta) : undefined,
    tags: [...run.tags],
  };
}

export function cloneAutomationArtefact(
  artefact: GranolaAutomationArtefact,
): GranolaAutomationArtefact {
  return {
    ...artefact,
    attempts: artefact.attempts.map((attempt) => ({ ...attempt })),
    history: artefact.history.map((entry) => ({ ...entry })),
    structured: cloneYazdStructuredOutput(artefact.structured),
  };
}

interface GranolaAutomationStateRepositoryDependencies {
  automationArtefactStore?: AutomationArtefactStore;
  automationArtefacts?: GranolaAutomationArtefact[];
  automationMatchStore?: AutomationMatchStore;
  automationMatches?: GranolaAutomationMatch[];
  automationRunStore?: AutomationRunStore;
  automationRuns?: GranolaAutomationActionRun[];
  automationRuleStore?: AutomationRuleStore;
  automationRules?: GranolaAutomationRule[];
  config: AppConfig;
  emitStateUpdate: () => void;
  onArtefactsChanged: (artefacts: GranolaAutomationArtefact[]) => Promise<void>;
  state: GranolaAppState;
}

export class GranolaAutomationStateRepository {
  #automationActionRuns: GranolaAutomationActionRun[];
  #automationArtefacts: GranolaAutomationArtefact[];
  #automationMatches: GranolaAutomationMatch[];
  #automationRules: GranolaAutomationRule[];

  constructor(private readonly deps: GranolaAutomationStateRepositoryDependencies) {
    this.#automationArtefacts = (deps.automationArtefacts ?? []).map((artefact) =>
      cloneAutomationArtefact(artefact),
    );
    this.#automationMatches = (deps.automationMatches ?? []).map((match) =>
      cloneAutomationMatch(match),
    );
    this.#automationActionRuns = (deps.automationRuns ?? []).map((run) => cloneAutomationRun(run));
    this.#automationRules = (deps.automationRules ?? []).map((rule) => cloneAutomationRule(rule));
    this.refreshAutomationState();
  }

  artefacts(): GranolaAutomationArtefact[] {
    return this.#automationArtefacts.map((artefact) => cloneAutomationArtefact(artefact));
  }

  matches(): GranolaAutomationMatch[] {
    return this.#automationMatches.map((match) => cloneAutomationMatch(match));
  }

  runs(): GranolaAutomationActionRun[] {
    return this.#automationActionRuns.map((run) => cloneAutomationRun(run));
  }

  rules(): GranolaAutomationRule[] {
    return this.#automationRules.map((rule) => cloneAutomationRule(rule));
  }

  async listArtefacts(
    options: GranolaAutomationArtefactListOptions = {},
  ): Promise<GranolaAutomationArtefact[]> {
    const limit = options.limit ?? 20;
    const artefacts = this.deps.automationArtefactStore
      ? await this.deps.automationArtefactStore.readArtefacts({
          kind: options.kind,
          limit,
          meetingId: options.meetingId,
          status: options.status,
        })
      : this.#automationArtefacts
          .filter((artefact) => {
            if (options.kind && artefact.kind !== options.kind) {
              return false;
            }
            if (options.meetingId && artefact.meetingId !== options.meetingId) {
              return false;
            }
            if (options.status && artefact.status !== options.status) {
              return false;
            }
            return true;
          })
          .slice(0, limit);

    return artefacts.map((artefact) => cloneAutomationArtefact(artefact));
  }

  async loadRules(options: { forceRefresh?: boolean } = {}): Promise<GranolaAutomationRule[]> {
    if (this.#automationRules.length > 0 && !options.forceRefresh) {
      return this.rules();
    }

    if (!this.deps.automationRuleStore) {
      return [];
    }

    this.#automationRules = (await this.deps.automationRuleStore.readRules()).map((rule) =>
      cloneAutomationRule(rule),
    );
    this.refreshAutomationState();
    this.deps.emitStateUpdate();
    return this.rules();
  }

  async saveRules(rules: GranolaAutomationRule[]): Promise<GranolaAutomationRule[]> {
    if (!this.deps.automationRuleStore) {
      throw new Error("automation rule store is not configured");
    }

    await this.deps.automationRuleStore.writeRules(rules.map((rule) => cloneAutomationRule(rule)));
    this.#automationRules = rules.map((rule) => cloneAutomationRule(rule));
    this.refreshAutomationState();
    this.deps.emitStateUpdate();
    return this.rules();
  }

  async listMatches(options: { limit?: number } = {}): Promise<GranolaAutomationMatch[]> {
    const limit = options.limit ?? 20;
    const matches = this.deps.automationMatchStore
      ? await this.deps.automationMatchStore.readMatches(limit)
      : this.#automationMatches.slice(-limit).reverse();
    return matches.map((match) => cloneAutomationMatch(match));
  }

  async appendMatches(matches: GranolaAutomationMatch[]): Promise<void> {
    if (matches.length === 0) {
      return;
    }

    if (this.deps.automationMatchStore) {
      await this.deps.automationMatchStore.appendMatches(matches);
    }

    this.#automationMatches.push(...matches.map((match) => cloneAutomationMatch(match)));
    this.refreshAutomationState();
  }

  async readMatchById(id: string): Promise<GranolaAutomationMatch | undefined> {
    return (
      (this.deps.automationMatchStore
        ? (await this.deps.automationMatchStore.readMatches(0)).find(
            (candidate) => candidate.id === id,
          )
        : undefined) ?? this.#automationMatches.find((candidate) => candidate.id === id)
    );
  }

  async listRuns(
    options: { limit?: number; status?: GranolaAutomationActionRun["status"] } = {},
  ): Promise<GranolaAutomationActionRun[]> {
    const limit = options.limit ?? 20;
    const runs = this.deps.automationRunStore
      ? await this.deps.automationRunStore.readRuns({
          limit,
          status: options.status,
        })
      : this.#automationActionRuns
          .filter((run) => (options.status ? run.status === options.status : true))
          .slice(0, limit);
    return runs.map((run) => cloneAutomationRun(run));
  }

  async appendRuns(runs: GranolaAutomationActionRun[]): Promise<void> {
    if (runs.length === 0) {
      return;
    }

    if (this.deps.automationRunStore) {
      await this.deps.automationRunStore.appendRuns(runs);
    }

    for (const run of runs) {
      const index = this.#automationActionRuns.findIndex((candidate) => candidate.id === run.id);
      if (index >= 0) {
        this.#automationActionRuns[index] = cloneAutomationRun(run);
      } else {
        this.#automationActionRuns.push(cloneAutomationRun(run));
      }
    }

    this.#automationActionRuns.sort((left, right) =>
      (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt),
    );
    this.refreshAutomationState();
  }

  async readRunById(id: string): Promise<GranolaAutomationActionRun | undefined> {
    return (
      (this.deps.automationRunStore ? await this.deps.automationRunStore.readRun(id) : undefined) ??
      this.#automationActionRuns.find((run) => run.id === id)
    );
  }

  async writeArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void> {
    this.#automationArtefacts = artefacts
      .map((artefact) => cloneAutomationArtefact(artefact))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    if (this.deps.automationArtefactStore) {
      await this.deps.automationArtefactStore.writeArtefacts(this.#automationArtefacts);
    }

    await this.deps.onArtefactsChanged(this.#automationArtefacts);
    this.refreshAutomationState();
  }

  async readArtefactById(id: string): Promise<GranolaAutomationArtefact | undefined> {
    return (
      (this.deps.automationArtefactStore
        ? await this.deps.automationArtefactStore.readArtefact(id)
        : undefined) ?? this.#automationArtefacts.find((artefact) => artefact.id === id)
    );
  }

  async replaceArtefact(
    nextArtefact: GranolaAutomationArtefact,
  ): Promise<GranolaAutomationArtefact> {
    const nextArtefacts = [
      cloneAutomationArtefact(nextArtefact),
      ...this.#automationArtefacts
        .filter((artefact) => artefact.id !== nextArtefact.id)
        .map((artefact) => cloneAutomationArtefact(artefact)),
    ];
    await this.writeArtefacts(nextArtefacts);
    this.deps.emitStateUpdate();
    return cloneAutomationArtefact(
      this.#automationArtefacts.find((artefact) => artefact.id === nextArtefact.id) ?? nextArtefact,
    );
  }

  private refreshAutomationState(): void {
    const latestMatch = this.#automationMatches.reduce<GranolaAutomationMatch | undefined>(
      (current, candidate) =>
        !current || candidate.matchedAt.localeCompare(current.matchedAt) > 0 ? candidate : current,
      undefined,
    );
    const latestRun = this.#automationActionRuns.reduce<GranolaAutomationActionRun | undefined>(
      (current, candidate) => {
        const candidateTime = candidate.finishedAt ?? candidate.startedAt;
        const currentTime = current ? (current.finishedAt ?? current.startedAt) : undefined;
        return !currentTime || candidateTime.localeCompare(currentTime) > 0 ? candidate : current;
      },
      undefined,
    );

    this.deps.state.automation = {
      ...this.deps.state.automation,
      artefactCount: this.#automationArtefacts.length,
      artefactsFile:
        this.deps.config.automation?.artefactsFile ?? this.deps.state.automation.artefactsFile,
      lastMatchedAt: latestMatch?.matchedAt ?? this.deps.state.automation.lastMatchedAt,
      lastRunAt:
        latestRun?.finishedAt ?? latestRun?.startedAt ?? this.deps.state.automation.lastRunAt,
      loaded: true,
      matchCount: this.#automationMatches.length,
      matchesFile: defaultAutomationMatchesFilePath(),
      pendingArtefactCount: this.#automationArtefacts.filter(
        (artefact) => artefact.status === "generated",
      ).length,
      pendingRunCount: this.#automationActionRuns.filter((run) => run.status === "pending").length,
      ruleCount: this.#automationRules.length,
      rulesFile: this.deps.config.automation?.rulesFile ?? this.deps.state.automation.rulesFile,
      runCount: this.#automationActionRuns.length,
      runsFile: this.deps.state.automation.runsFile,
    };
  }
}
