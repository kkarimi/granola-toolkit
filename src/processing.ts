import type {
  GranolaAutomationArtefactKind,
  GranolaAutomationArtefactParticipantSummary,
  GranolaAutomationArtefactStructuredOutput,
  MeetingRoleHelpersRecord,
} from "./app/index.ts";
import { resolveMeetingOwnerCandidate } from "./meeting-roles.ts";
import { asRecord, parseJsonString, stringArray, stringValue } from "./utils.ts";

interface StructuredPayload {
  actionItems?: unknown;
  decisions?: unknown;
  followUps?: unknown;
  highlights?: unknown;
  markdown?: unknown;
  metadata?: unknown;
  participantSummaries?: unknown;
  sections?: unknown;
  summary?: unknown;
  title?: unknown;
}

function firstParagraph(markdown: string): string | undefined {
  const paragraph = markdown
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^#+\s+/gm, "").trim())
    .find((block) => block.length > 0);
  return paragraph ? paragraph.slice(0, 280) : undefined;
}

function markdownSections(markdown: string): Array<{ body: string; title: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ body: string; title: string }> = [];
  let currentTitle = "Overview";
  let currentBody: string[] = [];

  const pushCurrent = (): void => {
    const body = currentBody.join("\n").trim();
    if (!body) {
      return;
    }

    sections.push({
      body,
      title: currentTitle,
    });
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      pushCurrent();
      currentTitle = headingMatch[2]?.trim() || "Section";
      currentBody = [];
      continue;
    }

    currentBody.push(line);
  }

  pushCurrent();
  return sections;
}

function normaliseStrings(value: unknown): string[] {
  return stringArray(value)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseActionItems(
  value: unknown,
  roleHelpers?: MeetingRoleHelpersRecord,
): GranolaAutomationArtefactStructuredOutput["actionItems"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return undefined;
      }

      const title = stringValue(record.title).trim();
      if (!title) {
        return undefined;
      }

      const owner = resolveMeetingOwnerCandidate(stringValue(record.owner), roleHelpers);
      const ownerEmail = stringValue(record.ownerEmail).trim() || owner.ownerEmail;
      const ownerOriginal = stringValue(record.ownerOriginal).trim() || owner.ownerOriginal;
      const ownerRoleValue = stringValue(record.ownerRole).trim();
      const ownerRole =
        ownerRoleValue === "attendee" ||
        ownerRoleValue === "creator" ||
        ownerRoleValue === "self" ||
        ownerRoleValue === "system" ||
        ownerRoleValue === "unknown"
          ? ownerRoleValue
          : owner.ownerRole;

      return {
        dueDate: stringValue(record.dueDate).trim() || undefined,
        owner: owner.owner,
        ownerEmail: ownerEmail || undefined,
        ownerOriginal: ownerOriginal || undefined,
        ownerRole,
        title,
      };
    })
    .filter((item) => Boolean(item)) as GranolaAutomationArtefactStructuredOutput["actionItems"];
}

function normaliseParticipantSummaries(
  value: unknown,
): GranolaAutomationArtefactParticipantSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const summaries = value
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return undefined;
      }

      const speaker = stringValue(record.speaker).trim();
      const summary = stringValue(record.summary).trim();
      if (!speaker || !summary) {
        return undefined;
      }

      const role = stringValue(record.role).trim();
      return {
        actionItems: normaliseStrings(record.actionItems),
        role:
          role === "attendee" ||
          role === "creator" ||
          role === "self" ||
          role === "system" ||
          role === "unknown"
            ? role
            : undefined,
        speaker,
        summary,
      };
    })
    .filter(Boolean) as GranolaAutomationArtefactParticipantSummary[];

  return summaries.length > 0 ? summaries : undefined;
}

function normaliseSections(value: unknown): GranolaAutomationArtefactStructuredOutput["sections"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) {
        return undefined;
      }

      const title = stringValue(record.title).trim();
      const body = stringValue(record.body).trim();
      if (!title || !body) {
        return undefined;
      }

      return { body, title };
    })
    .filter((item) => Boolean(item)) as GranolaAutomationArtefactStructuredOutput["sections"];
}

function extractJsonPayload(rawOutput: string): StructuredPayload | undefined {
  const direct = parseJsonString<StructuredPayload>(rawOutput);
  if (direct) {
    return direct;
  }

  const fencedMatch = rawOutput.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (!fencedMatch?.[1]) {
    return undefined;
  }

  return parseJsonString<StructuredPayload>(fencedMatch[1].trim());
}

export function buildPipelineInstructions(
  kind: GranolaAutomationArtefactKind,
  instructions: string,
): string {
  const task =
    kind === "notes"
      ? "Turn the transcript and meeting context into improved meeting notes."
      : "Turn the transcript and meeting context into a structured enrichment for downstream workflows.";

  return [
    instructions.trim(),
    task,
    'Return JSON only. Use this exact shape: {"title":"string","summary":"string","markdown":"string","sections":[{"title":"string","body":"string"}],"actionItems":[{"title":"string","owner":"string","ownerEmail":"string","ownerRole":"string","dueDate":"string"}],"participantSummaries":[{"speaker":"string","role":"string","summary":"string","actionItems":["string"]}],"decisions":["string"],"followUps":["string"],"highlights":["string"],"metadata":{}}',
    "When meeting role helpers are provided, prefer canonical owner names and emails from those candidates instead of vague owners like 'you' or first-name fragments.",
    "Keep arrays empty instead of omitting them. markdown must contain the full Markdown result.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parsePipelineOutput(options: {
  kind: GranolaAutomationArtefactKind;
  meetingTitle: string;
  rawOutput: string;
  roleHelpers?: MeetingRoleHelpersRecord;
}): {
  parseMode: "json" | "markdown-fallback";
  structured: GranolaAutomationArtefactStructuredOutput;
} {
  const rawOutput = options.rawOutput.trim();
  const payload = extractJsonPayload(rawOutput);

  if (payload) {
    const title = stringValue(payload.title).trim() || options.meetingTitle;
    const markdown = stringValue(payload.markdown).trim();
    if (markdown) {
      return {
        parseMode: "json",
        structured: {
          actionItems: normaliseActionItems(payload.actionItems, options.roleHelpers),
          decisions: normaliseStrings(payload.decisions),
          followUps: normaliseStrings(payload.followUps),
          highlights: normaliseStrings(payload.highlights),
          markdown,
          metadata: asRecord(payload.metadata),
          participantSummaries: normaliseParticipantSummaries(payload.participantSummaries),
          sections: normaliseSections(payload.sections),
          summary: stringValue(payload.summary).trim() || firstParagraph(markdown),
          title,
        },
      };
    }
  }

  const markdown = rawOutput || `# ${options.meetingTitle}\n`;
  return {
    parseMode: "markdown-fallback",
    structured: {
      actionItems: [],
      decisions: [],
      followUps: [],
      highlights: [],
      markdown,
      metadata: {
        fallbackKind: options.kind,
      },
      participantSummaries: undefined,
      sections: markdownSections(markdown),
      summary: firstParagraph(markdown),
      title:
        options.kind === "notes"
          ? `${options.meetingTitle} Generated Notes`
          : `${options.meetingTitle} Enrichment`,
    },
  };
}
