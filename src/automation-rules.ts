import { readFile } from "node:fs/promises";

import type {
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaAppSyncEvent,
} from "./app/index.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { parseJsonString } from "./utils.ts";

function cloneRule(rule: GranolaAutomationRule): GranolaAutomationRule {
  return {
    ...rule,
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

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return values.length > 0 ? [...new Set(values.map((item) => item.trim()))] : undefined;
}

function parseRule(value: unknown): GranolaAutomationRule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined;
  const name =
    typeof record.name === "string" && record.name.trim() ? record.name.trim() : undefined;
  const whenValue =
    record.when && typeof record.when === "object" && !Array.isArray(record.when)
      ? (record.when as Record<string, unknown>)
      : undefined;

  if (!id || !name || !whenValue) {
    return undefined;
  }

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    id,
    name,
    when: {
      eventKinds: stringArray(whenValue.eventKinds) as GranolaAutomationRule["when"]["eventKinds"],
      folderIds: stringArray(whenValue.folderIds),
      folderNames: stringArray(whenValue.folderNames),
      meetingIds: stringArray(whenValue.meetingIds),
      tags: stringArray(whenValue.tags),
      titleIncludes: stringArray(whenValue.titleIncludes),
      titleMatches:
        typeof whenValue.titleMatches === "string" && whenValue.titleMatches.trim()
          ? whenValue.titleMatches.trim()
          : undefined,
      transcriptLoaded:
        typeof whenValue.transcriptLoaded === "boolean" ? whenValue.transcriptLoaded : undefined,
    },
  };
}

export interface AutomationRuleStore {
  readRules(): Promise<GranolaAutomationRule[]>;
}

export class MemoryAutomationRuleStore implements AutomationRuleStore {
  constructor(private readonly rules: GranolaAutomationRule[] = []) {}

  async readRules(): Promise<GranolaAutomationRule[]> {
    return this.rules.map(cloneRule);
  }
}

export class FileAutomationRuleStore implements AutomationRuleStore {
  constructor(private readonly filePath: string = defaultAutomationRulesFilePath()) {}

  async readRules(): Promise<GranolaAutomationRule[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<unknown>(contents);
      const rawRules = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { rules?: unknown[] }).rules)
          ? (parsed as { rules: unknown[] }).rules
          : [];

      return rawRules
        .map((rule) => parseRule(rule))
        .filter((rule): rule is GranolaAutomationRule => Boolean(rule))
        .map(cloneRule);
    } catch {
      return [];
    }
  }
}

export function defaultAutomationRulesFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().automationRulesFile;
}

function includesIgnoreCase(candidate: string, values: string[]): boolean {
  const lowerCandidate = candidate.toLowerCase();
  return values.some((value) => lowerCandidate.includes(value.toLowerCase()));
}

function matchesRule(rule: GranolaAutomationRule, event: GranolaAppSyncEvent): boolean {
  if (rule.enabled === false) {
    return false;
  }

  const { when } = rule;

  if (when.eventKinds?.length && !when.eventKinds.includes(event.kind)) {
    return false;
  }

  if (when.meetingIds?.length && !when.meetingIds.includes(event.meetingId)) {
    return false;
  }

  if (
    when.folderIds?.length &&
    !event.folders.some((folder) => when.folderIds?.includes(folder.id))
  ) {
    return false;
  }

  if (
    when.folderNames?.length &&
    !event.folders.some((folder) => when.folderNames?.includes(folder.name))
  ) {
    return false;
  }

  if (when.tags?.length && !event.tags.some((tag) => when.tags?.includes(tag))) {
    return false;
  }

  if (when.titleIncludes?.length && !includesIgnoreCase(event.title, when.titleIncludes)) {
    return false;
  }

  if (when.titleMatches) {
    try {
      const pattern = new RegExp(when.titleMatches, "i");
      if (!pattern.test(event.title)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  if (
    typeof when.transcriptLoaded === "boolean" &&
    when.transcriptLoaded !== event.transcriptLoaded
  ) {
    return false;
  }

  return true;
}

export function matchAutomationRules(
  rules: GranolaAutomationRule[],
  events: GranolaAppSyncEvent[],
  matchedAt: string,
): GranolaAutomationMatch[] {
  const matches: GranolaAutomationMatch[] = [];

  for (const event of events) {
    for (const rule of rules) {
      if (!matchesRule(rule, event)) {
        continue;
      }

      matches.push({
        eventId: event.id,
        eventKind: event.kind,
        folders: event.folders.map((folder) => ({ ...folder })),
        id: `${event.id}:${rule.id}`,
        matchedAt,
        meetingId: event.meetingId,
        ruleId: rule.id,
        ruleName: rule.name,
        tags: [...event.tags],
        title: event.title,
        transcriptLoaded: event.transcriptLoaded,
      });
    }
  }

  return matches;
}

export function createDefaultAutomationRuleStore(filePath?: string): AutomationRuleStore {
  return new FileAutomationRuleStore(filePath);
}
