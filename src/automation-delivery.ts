import { resolve as resolvePath } from "node:path";

import type {
  GranolaAutomationActionKind,
  GranolaAutomationActionTrigger,
  GranolaAutomationArtefact,
  GranolaAutomationMatch,
  GranolaAutomationRule,
  GranolaAutomationSlackMessageAction,
  GranolaAutomationWebhookAction,
  GranolaAutomationWebhookPayloadFormat,
  GranolaAutomationWriteFileAction,
  GranolaAutomationWriteFileFormat,
  GranolaMeetingBundle,
} from "./app/index.ts";
import { sanitiseFilename } from "./utils.ts";

export interface AutomationDeliveryPayload {
  action: {
    id: string;
    kind: string;
    name: string;
  };
  approval?: {
    artefactId: string;
    decidedAt: string;
    decision: "approve" | "reject";
    note?: string;
  };
  artefact?: {
    actionId: string;
    actionItems: GranolaAutomationArtefact["structured"]["actionItems"];
    decisions: string[];
    followUps: string[];
    id: string;
    highlights: string[];
    kind: string;
    markdown: string;
    metadata?: Record<string, unknown>;
    model: string;
    participantSummaries?: GranolaAutomationArtefact["structured"]["participantSummaries"];
    prompt: string;
    provider: string;
    sections: GranolaAutomationArtefact["structured"]["sections"];
    status: string;
    summary?: string;
    title: string;
  };
  generatedAt: string;
  match: GranolaAutomationMatch;
  meeting?: {
    document: GranolaMeetingBundle["document"];
    id: string;
    meeting: GranolaMeetingBundle["meeting"];
    title: string;
  };
  rule: {
    id: string;
    name: string;
  };
}

export interface AutomationDeliveryContext {
  action: {
    id: string;
    kind: GranolaAutomationActionKind;
    name?: string;
  };
  artefact?: GranolaAutomationArtefact;
  bundle?: GranolaMeetingBundle;
  decision?: "approve" | "reject";
  generatedAt: string;
  match: GranolaAutomationMatch;
  note?: string;
  rule: GranolaAutomationRule;
  trigger: GranolaAutomationActionTrigger;
}

function getTemplateValue(record: unknown, path: string): unknown {
  let current = record;
  for (const segment of path.split(".")) {
    if (!segment) {
      return undefined;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function templateValueAsString(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function renderAutomationTemplate(
  template: string,
  payload: AutomationDeliveryPayload,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path: string) =>
    templateValueAsString(getTemplateValue(payload, path)),
  );
}

function defaultMeetingTitle(
  bundle: GranolaMeetingBundle | undefined,
  match: GranolaAutomationMatch,
): string {
  return bundle?.meeting.meeting.title || bundle?.document.title || match.title;
}

export function buildAutomationDeliveryPayload(
  context: AutomationDeliveryContext,
): AutomationDeliveryPayload {
  return {
    action: {
      id: context.action.id,
      kind: context.action.kind,
      name: context.action.name || context.action.id,
    },
    approval:
      context.trigger === "approval" && context.artefact && context.decision
        ? {
            artefactId: context.artefact.id,
            decidedAt: context.generatedAt,
            decision: context.decision,
            note: context.note?.trim() || undefined,
          }
        : undefined,
    artefact: context.artefact
      ? {
          actionId: context.artefact.actionId,
          actionItems: context.artefact.structured.actionItems.map((item) => ({ ...item })),
          decisions: [...context.artefact.structured.decisions],
          followUps: [...context.artefact.structured.followUps],
          id: context.artefact.id,
          highlights: [...context.artefact.structured.highlights],
          kind: context.artefact.kind,
          markdown: context.artefact.structured.markdown,
          metadata: context.artefact.structured.metadata,
          model: context.artefact.model,
          participantSummaries: context.artefact.structured.participantSummaries?.map(
            (summary) => ({
              ...summary,
              actionItems: [...summary.actionItems],
            }),
          ),
          prompt: context.artefact.prompt,
          provider: context.artefact.provider,
          sections: context.artefact.structured.sections.map((section) => ({ ...section })),
          status: context.artefact.status,
          summary: context.artefact.structured.summary,
          title: context.artefact.structured.title,
        }
      : undefined,
    generatedAt: context.generatedAt,
    match: {
      ...context.match,
      folders: context.match.folders.map((folder) => ({ ...folder })),
      tags: [...context.match.tags],
    },
    meeting: context.bundle
      ? {
          document: context.bundle.document,
          id: context.bundle.document.id,
          meeting: context.bundle.meeting,
          title: defaultMeetingTitle(context.bundle, context.match),
        }
      : undefined,
    rule: {
      id: context.rule.id,
      name: context.rule.name,
    },
  };
}

function defaultDeliveryText(payload: AutomationDeliveryPayload): string {
  if (payload.artefact?.summary?.trim()) {
    return payload.artefact.summary.trim();
  }

  if (payload.artefact?.markdown?.trim()) {
    return payload.artefact.markdown.trim();
  }

  return `${payload.action.name} for ${payload.meeting?.title || payload.match.title}`;
}

export function renderSlackMessageText(
  action: GranolaAutomationSlackMessageAction,
  payload: AutomationDeliveryPayload,
): string {
  const text = action.text?.trim();
  if (text) {
    return renderAutomationTemplate(text, payload).trim();
  }

  return defaultDeliveryText(payload);
}

export function renderWebhookBody(
  action: GranolaAutomationWebhookAction,
  payload: AutomationDeliveryPayload,
): { body: string; contentType: string } {
  const format: GranolaAutomationWebhookPayloadFormat = action.payload ?? "json";
  if (format === "json") {
    return {
      body: JSON.stringify(payload, null, 2),
      contentType: "application/json",
    };
  }

  const template = action.bodyTemplate?.trim();
  const rendered = template
    ? renderAutomationTemplate(template, payload).trim()
    : defaultDeliveryText(payload);
  return {
    body: rendered,
    contentType:
      format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8",
  };
}

function defaultWriteFileExtension(format: GranolaAutomationWriteFileFormat): string {
  switch (format) {
    case "json":
      return "json";
    case "text":
      return "txt";
    case "markdown":
    default:
      return "md";
  }
}

export function renderWriteFileName(
  action: GranolaAutomationWriteFileAction,
  payload: AutomationDeliveryPayload,
): string {
  const format = action.format ?? "markdown";
  const template = action.filenameTemplate?.trim();
  if (template) {
    return sanitiseFilename(renderAutomationTemplate(template, payload), payload.action.id);
  }

  const meeting = payload.meeting?.title || payload.match.title;
  const artefactKind = payload.artefact?.kind || payload.action.id;
  return `${sanitiseFilename(`${meeting}-${artefactKind}`)}.${defaultWriteFileExtension(format)}`;
}

export function resolveWriteFilePath(
  action: GranolaAutomationWriteFileAction,
  payload: AutomationDeliveryPayload,
): string {
  return resolvePath(action.outputDir, renderWriteFileName(action, payload));
}

export function renderWriteFileContent(
  action: GranolaAutomationWriteFileAction,
  payload: AutomationDeliveryPayload,
): string {
  const format: GranolaAutomationWriteFileFormat = action.format ?? "markdown";
  const template = action.contentTemplate?.trim();
  if (template) {
    return renderAutomationTemplate(template, payload);
  }

  if (format === "json") {
    return JSON.stringify(payload, null, 2);
  }

  if (format === "text") {
    return `${defaultDeliveryText(payload)}\n`;
  }

  return `${payload.artefact?.markdown?.trim() || defaultDeliveryText(payload)}\n`;
}
