import { readFile } from "node:fs/promises";

import type {
  GranolaAutomationMatch,
  GranolaMeetingBundle,
  GranolaSyncEventKind,
} from "./app/index.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import type { GranolaAgentProviderKind } from "./types.ts";
import { parseJsonString } from "./utils.ts";

export interface GranolaAgentHarnessMatch {
  calendarEventIds?: string[];
  eventKinds?: GranolaSyncEventKind[];
  folderIds?: string[];
  folderNames?: string[];
  meetingIds?: string[];
  recurringEventIds?: string[];
  tags?: string[];
  titleIncludes?: string[];
  titleMatches?: string;
  transcriptLoaded?: boolean;
}

export interface GranolaAgentHarness {
  cwd?: string;
  id: string;
  match?: GranolaAgentHarnessMatch;
  model?: string;
  name: string;
  priority?: number;
  prompt?: string;
  promptFile?: string;
  provider?: GranolaAgentProviderKind;
  systemPrompt?: string;
  systemPromptFile?: string;
}

export interface GranolaAgentHarnessContext {
  bundle?: GranolaMeetingBundle;
  match: GranolaAutomationMatch;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return values.length > 0 ? [...new Set(values)] : undefined;
}

function parseMatch(value: unknown): GranolaAgentHarnessMatch | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return {
    calendarEventIds: stringArray(record.calendarEventIds),
    eventKinds: stringArray(record.eventKinds) as GranolaSyncEventKind[] | undefined,
    folderIds: stringArray(record.folderIds),
    folderNames: stringArray(record.folderNames),
    meetingIds: stringArray(record.meetingIds),
    recurringEventIds: stringArray(record.recurringEventIds),
    tags: stringArray(record.tags),
    titleIncludes: stringArray(record.titleIncludes),
    titleMatches:
      typeof record.titleMatches === "string" && record.titleMatches.trim()
        ? record.titleMatches.trim()
        : undefined,
    transcriptLoaded:
      typeof record.transcriptLoaded === "boolean" ? record.transcriptLoaded : undefined,
  };
}

function parseHarness(value: unknown): GranolaAgentHarness | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined;
  const name =
    typeof record.name === "string" && record.name.trim() ? record.name.trim() : undefined;
  if (!id || !name) {
    return undefined;
  }

  const provider =
    record.provider === "codex" || record.provider === "openai" || record.provider === "openrouter"
      ? record.provider
      : undefined;
  const prompt =
    typeof record.prompt === "string" && record.prompt.trim() ? record.prompt.trim() : undefined;
  const promptFile =
    typeof record.promptFile === "string" && record.promptFile.trim()
      ? record.promptFile.trim()
      : undefined;
  if (!prompt && !promptFile) {
    return undefined;
  }

  return {
    cwd: typeof record.cwd === "string" && record.cwd.trim() ? record.cwd.trim() : undefined,
    id,
    match: parseMatch(record.match),
    model:
      typeof record.model === "string" && record.model.trim() ? record.model.trim() : undefined,
    name,
    priority:
      typeof record.priority === "number" && Number.isFinite(record.priority)
        ? record.priority
        : typeof record.priority === "string" && /^-?\d+$/.test(record.priority)
          ? Number(record.priority)
          : undefined,
    prompt,
    promptFile,
    provider,
    systemPrompt:
      typeof record.systemPrompt === "string" && record.systemPrompt.trim()
        ? record.systemPrompt.trim()
        : undefined,
    systemPromptFile:
      typeof record.systemPromptFile === "string" && record.systemPromptFile.trim()
        ? record.systemPromptFile.trim()
        : undefined,
  };
}

function cloneHarness(harness: GranolaAgentHarness): GranolaAgentHarness {
  return {
    ...harness,
    match: harness.match
      ? {
          ...harness.match,
          calendarEventIds: harness.match.calendarEventIds
            ? [...harness.match.calendarEventIds]
            : undefined,
          eventKinds: harness.match.eventKinds ? [...harness.match.eventKinds] : undefined,
          folderIds: harness.match.folderIds ? [...harness.match.folderIds] : undefined,
          folderNames: harness.match.folderNames ? [...harness.match.folderNames] : undefined,
          meetingIds: harness.match.meetingIds ? [...harness.match.meetingIds] : undefined,
          recurringEventIds: harness.match.recurringEventIds
            ? [...harness.match.recurringEventIds]
            : undefined,
          tags: harness.match.tags ? [...harness.match.tags] : undefined,
          titleIncludes: harness.match.titleIncludes ? [...harness.match.titleIncludes] : undefined,
        }
      : undefined,
  };
}

function includesIgnoreCase(candidate: string, values: string[]): boolean {
  const lowerCandidate = candidate.toLowerCase();
  return values.some((value) => lowerCandidate.includes(value.toLowerCase()));
}

function harnessSpecificity(match?: GranolaAgentHarnessMatch): number {
  if (!match) {
    return 0;
  }

  return [
    match.calendarEventIds?.length ?? 0,
    match.eventKinds?.length ?? 0,
    match.folderIds?.length ?? 0,
    match.folderNames?.length ?? 0,
    match.meetingIds?.length ?? 0,
    match.recurringEventIds?.length ?? 0,
    match.tags?.length ?? 0,
    match.titleIncludes?.length ?? 0,
    match.titleMatches ? 1 : 0,
    match.transcriptLoaded != null ? 1 : 0,
  ].reduce((total, count) => total + count, 0);
}

function matchesHarness(
  harness: GranolaAgentHarness,
  context: GranolaAgentHarnessContext,
): boolean {
  const match = harness.match;
  if (!match) {
    return true;
  }

  if (match.eventKinds?.length && !match.eventKinds.includes(context.match.eventKind)) {
    return false;
  }

  if (match.meetingIds?.length && !match.meetingIds.includes(context.match.meetingId)) {
    return false;
  }

  if (
    match.folderIds?.length &&
    !context.match.folders.some((folder) => match.folderIds?.includes(folder.id))
  ) {
    return false;
  }

  if (
    match.folderNames?.length &&
    !context.match.folders.some((folder) => match.folderNames?.includes(folder.name))
  ) {
    return false;
  }

  if (match.tags?.length && !context.match.tags.some((tag) => match.tags?.includes(tag))) {
    return false;
  }

  if (match.transcriptLoaded != null && context.match.transcriptLoaded !== match.transcriptLoaded) {
    return false;
  }

  if (
    match.titleIncludes?.length &&
    !includesIgnoreCase(context.match.title, match.titleIncludes)
  ) {
    return false;
  }

  if (match.titleMatches) {
    try {
      const pattern = new RegExp(match.titleMatches, "i");
      if (!pattern.test(context.match.title)) {
        return false;
      }
    } catch {
      return false;
    }
  }

  const calendarEventId = context.bundle?.document.calendarEvent?.id;
  if (match.calendarEventIds?.length && !calendarEventId) {
    return false;
  }
  if (match.calendarEventIds?.length && !match.calendarEventIds.includes(calendarEventId!)) {
    return false;
  }

  const recurringEventId = context.bundle?.document.calendarEvent?.recurringEventId;
  if (match.recurringEventIds?.length && !recurringEventId) {
    return false;
  }
  if (match.recurringEventIds?.length && !match.recurringEventIds.includes(recurringEventId!)) {
    return false;
  }

  return true;
}

export function matchAgentHarnesses(
  harnesses: GranolaAgentHarness[],
  context: GranolaAgentHarnessContext,
): GranolaAgentHarness[] {
  return harnesses
    .filter((harness) => matchesHarness(harness, context))
    .slice()
    .sort((left, right) => {
      const priority = (right.priority ?? 0) - (left.priority ?? 0);
      if (priority !== 0) {
        return priority;
      }

      return harnessSpecificity(right.match) - harnessSpecificity(left.match);
    })
    .map(cloneHarness);
}

export function resolveAgentHarness(
  harnesses: GranolaAgentHarness[],
  context: GranolaAgentHarnessContext,
  harnessId?: string,
): GranolaAgentHarness | undefined {
  if (harnessId?.trim()) {
    const harness = harnesses.find((candidate) => candidate.id === harnessId.trim());
    if (!harness) {
      throw new Error(`agent harness not found: ${harnessId.trim()}`);
    }

    return cloneHarness(harness);
  }

  const matches = matchAgentHarnesses(harnesses, context);
  return matches[0];
}

export interface AgentHarnessStore {
  readHarnesses(): Promise<GranolaAgentHarness[]>;
}

export class MemoryAgentHarnessStore implements AgentHarnessStore {
  constructor(private readonly harnesses: GranolaAgentHarness[] = []) {}

  async readHarnesses(): Promise<GranolaAgentHarness[]> {
    return this.harnesses.map(cloneHarness);
  }
}

export class FileAgentHarnessStore implements AgentHarnessStore {
  constructor(private readonly filePath: string = defaultAgentHarnessesFilePath()) {}

  async readHarnesses(): Promise<GranolaAgentHarness[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = parseJsonString<unknown>(contents);
      const rawHarnesses = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { harnesses?: unknown[] }).harnesses)
          ? (parsed as { harnesses: unknown[] }).harnesses
          : [];

      return rawHarnesses
        .map((harness) => parseHarness(harness))
        .filter((harness): harness is GranolaAgentHarness => Boolean(harness))
        .map(cloneHarness);
    } catch {
      return [];
    }
  }
}

export function defaultAgentHarnessesFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().agentHarnessesFile;
}

export function createDefaultAgentHarnessStore(filePath?: string): AgentHarnessStore {
  return new FileAgentHarnessStore(filePath);
}
