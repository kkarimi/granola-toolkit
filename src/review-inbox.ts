import {
  summariseYazdReviewItems,
  sortYazdReviewItems,
  type YazdReviewItem,
  type YazdReviewSummary,
} from "@kkarimi/yazd-core";

import type {
  GranolaAutomationActionRun,
  GranolaAutomationArtefact,
  GranolaProcessingIssue,
} from "./app/types.ts";

type GranolaReviewInboxPayload =
  | {
      artefact: GranolaAutomationArtefact;
      kind: "artefact";
    }
  | {
      issue: GranolaProcessingIssue;
      kind: "issue";
    }
  | {
      kind: "run";
      run: GranolaAutomationActionRun;
    };

export type GranolaReviewInboxItem =
  | (YazdReviewItem<GranolaReviewInboxPayload> & {
      artefact: GranolaAutomationArtefact;
      bucket: "publish";
      key: string;
      kind: "artefact";
      meetingId: string;
      payload: {
        artefact: GranolaAutomationArtefact;
        kind: "artefact";
      };
    })
  | (YazdReviewItem<GranolaReviewInboxPayload> & {
      bucket: "recovery";
      issue: GranolaProcessingIssue;
      key: string;
      kind: "issue";
      meetingId?: string;
      payload: {
        issue: GranolaProcessingIssue;
        kind: "issue";
      };
    })
  | (YazdReviewItem<GranolaReviewInboxPayload> & {
      bucket: "approval";
      key: string;
      kind: "run";
      meetingId: string;
      payload: {
        kind: "run";
        run: GranolaAutomationActionRun;
      };
      run: GranolaAutomationActionRun;
    });

export type GranolaReviewInboxSummary = YazdReviewSummary;

function issuePriority(issue: GranolaProcessingIssue): number {
  if (issue.severity === "error" && issue.recoverable) {
    return 0;
  }

  if (issue.severity === "error") {
    return 1;
  }

  return 4;
}

function runPriority(_run: GranolaAutomationActionRun): number {
  return 3;
}

function artefactPriority(_artefact: GranolaAutomationArtefact): number {
  return 2;
}

export function buildGranolaReviewInbox(options: {
  artefacts: GranolaAutomationArtefact[];
  issues: GranolaProcessingIssue[];
  runs: GranolaAutomationActionRun[];
}): GranolaReviewInboxItem[] {
  const items: GranolaReviewInboxItem[] = [];

  for (const issue of options.issues) {
    items.push({
      bucket: "recovery",
      id: issue.id,
      issue,
      key: `issue:${issue.id}`,
      kind: "issue",
      meetingId: issue.meetingId,
      payload: {
        issue,
        kind: "issue",
      },
      priority: issuePriority(issue),
      status: issue.severity,
      subtitle: issue.kind,
      summary: issue.detail,
      timestamp: issue.detectedAt,
      title: issue.title,
    });
  }

  for (const artefact of options.artefacts) {
    if (artefact.status !== "generated") {
      continue;
    }

    items.push({
      artefact,
      bucket: "publish",
      id: artefact.id,
      key: `artefact:${artefact.id}`,
      kind: "artefact",
      meetingId: artefact.meetingId,
      payload: {
        artefact,
        kind: "artefact",
      },
      priority: artefactPriority(artefact),
      status: artefact.status,
      subtitle: `${artefact.kind} • ${artefact.ruleName}`,
      summary:
        artefact.structured.summary || artefact.structured.markdown || artefact.structured.title,
      timestamp: artefact.updatedAt,
      title: artefact.structured.title,
    });
  }

  for (const run of options.runs) {
    if (run.status !== "pending") {
      continue;
    }

    items.push({
      bucket: "approval",
      id: run.id,
      key: `run:${run.id}`,
      kind: "run",
      meetingId: run.meetingId,
      payload: {
        kind: "run",
        run,
      },
      priority: runPriority(run),
      run,
      status: run.status,
      subtitle: `${run.actionName} • ${run.ruleName}`,
      summary: run.prompt || run.result || run.error || run.eventKind,
      timestamp: run.startedAt,
      title: run.title,
    });
  }

  return sortYazdReviewItems(items);
}

export function summariseGranolaReviewInbox(
  items: GranolaReviewInboxItem[],
): GranolaReviewInboxSummary {
  return summariseYazdReviewItems(items);
}
