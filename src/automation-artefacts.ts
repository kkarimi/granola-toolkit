import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  cloneYazdStructuredOutput,
  normaliseYazdArtifactAttempt,
  normaliseYazdArtifactParseMode,
  normaliseYazdStructuredOutput,
} from "@kkarimi/yazd-core";
import type {
  GranolaAutomationArtefact,
  GranolaAutomationArtefactAttempt,
  GranolaAutomationArtefactHistoryAction,
  GranolaAutomationArtefactHistoryEntry,
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactStatus,
  GranolaAutomationArtefactStructuredOutput,
} from "./app/index.ts";
import { defaultGranolaToolkitPersistenceLayout } from "./persistence/layout.ts";
import { asRecord, parseJsonString, stringValue } from "./utils.ts";

const AUTOMATION_ARTEFACTS_VERSION = 1;
const MAX_AUTOMATION_ARTEFACTS = 200;

interface AutomationArtefactsFile {
  artefacts: GranolaAutomationArtefact[];
  version: number;
}

function cloneAttempt(attempt: GranolaAutomationArtefactAttempt): GranolaAutomationArtefactAttempt {
  return { ...attempt };
}

function cloneHistoryEntry(
  entry: GranolaAutomationArtefactHistoryEntry,
): GranolaAutomationArtefactHistoryEntry {
  return { ...entry };
}

function cloneArtefact(artefact: GranolaAutomationArtefact): GranolaAutomationArtefact {
  return {
    ...artefact,
    attempts: artefact.attempts.map((attempt) => cloneAttempt(attempt)),
    history: artefact.history.map((entry) => cloneHistoryEntry(entry)),
    structured: cloneYazdStructuredOutput(artefact.structured),
  };
}

function normaliseHistoryAction(
  value: unknown,
): GranolaAutomationArtefactHistoryAction | undefined {
  switch (value) {
    case "approved":
    case "edited":
    case "generated":
    case "rejected":
    case "rerun":
      return value;
    default:
      return undefined;
  }
}

function normaliseHistoryEntry(value: unknown): GranolaAutomationArtefactHistoryEntry | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const action = normaliseHistoryAction(record.action);
  const at = stringValue(record.at).trim();
  if (!action || !at) {
    return undefined;
  }

  return {
    action,
    at,
    note: stringValue(record.note).trim() || undefined,
  };
}

function normaliseAttempt(value: unknown): GranolaAutomationArtefactAttempt | undefined {
  return normaliseYazdArtifactAttempt(value, {
    providers: ["codex", "openai", "openrouter"] as const,
  }) as GranolaAutomationArtefactAttempt | undefined;
}

function normaliseStructured(
  value: unknown,
): GranolaAutomationArtefactStructuredOutput | undefined {
  return normaliseYazdStructuredOutput(value) as
    | GranolaAutomationArtefactStructuredOutput
    | undefined;
}

function normaliseArtefact(value: unknown): GranolaAutomationArtefact | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const id = stringValue(record.id).trim();
  const runId = stringValue(record.runId).trim();
  const meetingId = stringValue(record.meetingId).trim();
  const eventId = stringValue(record.eventId).trim();
  const matchId = stringValue(record.matchId).trim();
  const ruleId = stringValue(record.ruleId).trim();
  const ruleName = stringValue(record.ruleName).trim();
  const actionId = stringValue(record.actionId).trim();
  const actionName = stringValue(record.actionName).trim();
  const createdAt = stringValue(record.createdAt).trim();
  const updatedAt = stringValue(record.updatedAt).trim();
  const rawOutput = stringValue(record.rawOutput).trim();
  const prompt = stringValue(record.prompt).trim();
  const model = stringValue(record.model).trim();
  const provider = stringValue(record.provider).trim();
  const kind = stringValue(record.kind).trim();
  const status = stringValue(record.status).trim();
  const parseMode = normaliseYazdArtifactParseMode(record.parseMode);
  const structured = normaliseStructured(record.structured);

  if (
    !id ||
    !runId ||
    !meetingId ||
    !eventId ||
    !matchId ||
    !ruleId ||
    !ruleName ||
    !actionId ||
    !actionName ||
    !createdAt ||
    !updatedAt ||
    !rawOutput ||
    !prompt ||
    !model ||
    !structured ||
    (kind !== "enrichment" && kind !== "notes") ||
    (provider !== "codex" && provider !== "openai" && provider !== "openrouter") ||
    (status !== "approved" &&
      status !== "generated" &&
      status !== "rejected" &&
      status !== "superseded") ||
    !parseMode
  ) {
    return undefined;
  }

  return {
    actionId,
    actionName,
    attempts: Array.isArray(record.attempts)
      ? record.attempts
          .map((attempt) => normaliseAttempt(attempt))
          .filter((attempt): attempt is GranolaAutomationArtefactAttempt => Boolean(attempt))
      : [],
    createdAt,
    eventId,
    history: Array.isArray(record.history)
      ? record.history
          .map((entry) => normaliseHistoryEntry(entry))
          .filter((entry): entry is GranolaAutomationArtefactHistoryEntry => Boolean(entry))
      : [
          {
            action: "generated",
            at: createdAt,
          },
        ],
    id,
    kind,
    matchId,
    meetingId,
    model,
    parseMode,
    prompt,
    provider,
    rawOutput,
    rerunOfId: stringValue(record.rerunOfId).trim() || undefined,
    ruleId,
    ruleName,
    runId,
    status,
    structured,
    supersededById: stringValue(record.supersededById).trim() || undefined,
    updatedAt,
  };
}

function normaliseFile(parsed: unknown): AutomationArtefactsFile {
  const record = asRecord(parsed);
  if (
    !record ||
    record.version !== AUTOMATION_ARTEFACTS_VERSION ||
    !Array.isArray(record.artefacts)
  ) {
    return {
      artefacts: [],
      version: AUTOMATION_ARTEFACTS_VERSION,
    };
  }

  return {
    artefacts: record.artefacts
      .map((artefact) => normaliseArtefact(artefact))
      .filter((artefact): artefact is GranolaAutomationArtefact => Boolean(artefact))
      .slice(0, MAX_AUTOMATION_ARTEFACTS),
    version: AUTOMATION_ARTEFACTS_VERSION,
  };
}

function sortArtefacts(artefacts: GranolaAutomationArtefact[]): GranolaAutomationArtefact[] {
  return artefacts.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export interface AutomationArtefactStore {
  readArtefact(id: string): Promise<GranolaAutomationArtefact | undefined>;
  readArtefacts(options?: {
    kind?: GranolaAutomationArtefactKind;
    limit?: number;
    meetingId?: string;
    status?: GranolaAutomationArtefactStatus;
  }): Promise<GranolaAutomationArtefact[]>;
  writeArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void>;
}

export class FileAutomationArtefactStore implements AutomationArtefactStore {
  constructor(private readonly filePath: string = defaultAutomationArtefactsFilePath()) {}

  async readArtefact(id: string): Promise<GranolaAutomationArtefact | undefined> {
    return (await this.readArtefacts({ limit: 0 })).find((artefact) => artefact.id === id);
  }

  async readArtefacts(
    options: {
      kind?: GranolaAutomationArtefactKind;
      limit?: number;
      meetingId?: string;
      status?: GranolaAutomationArtefactStatus;
    } = {},
  ): Promise<GranolaAutomationArtefact[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const file = normaliseFile(parseJsonString<unknown>(raw));
      const filtered = sortArtefacts(file.artefacts).filter((artefact) => {
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
      });
      const limited =
        options.limit && options.limit > 0 ? filtered.slice(0, options.limit) : filtered;
      return limited.map((artefact) => cloneArtefact(artefact));
    } catch {
      return [];
    }
  }

  async writeArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void> {
    const payload: AutomationArtefactsFile = {
      artefacts: sortArtefacts(artefacts).slice(0, MAX_AUTOMATION_ARTEFACTS),
      version: AUTOMATION_ARTEFACTS_VERSION,
    };

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

export class MemoryAutomationArtefactStore implements AutomationArtefactStore {
  #artefacts: GranolaAutomationArtefact[] = [];

  async readArtefact(id: string): Promise<GranolaAutomationArtefact | undefined> {
    return sortArtefacts(this.#artefacts).find((artefact) => artefact.id === id);
  }

  async readArtefacts(
    options: {
      kind?: GranolaAutomationArtefactKind;
      limit?: number;
      meetingId?: string;
      status?: GranolaAutomationArtefactStatus;
    } = {},
  ): Promise<GranolaAutomationArtefact[]> {
    const filtered = sortArtefacts(this.#artefacts).filter((artefact) => {
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
    });
    const limited =
      options.limit && options.limit > 0 ? filtered.slice(0, options.limit) : filtered;
    return limited.map((artefact) => cloneArtefact(artefact));
  }

  async writeArtefacts(artefacts: GranolaAutomationArtefact[]): Promise<void> {
    this.#artefacts = sortArtefacts(artefacts).map((artefact) => cloneArtefact(artefact));
  }
}

export function defaultAutomationArtefactsFilePath(): string {
  return defaultGranolaToolkitPersistenceLayout().automationArtefactsFile;
}

export function createDefaultAutomationArtefactStore(filePath?: string): AutomationArtefactStore {
  return new FileAutomationArtefactStore(filePath);
}
