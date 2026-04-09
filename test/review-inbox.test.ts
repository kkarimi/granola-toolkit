import { describe, expect, test } from "vite-plus/test";

import { buildGranolaReviewInbox, summariseGranolaReviewInbox } from "../src/review-inbox.ts";

describe("buildGranolaReviewInbox", () => {
  test("orders recovery items before publish drafts and approval prompts", () => {
    const items = buildGranolaReviewInbox({
      artefacts: [
        {
          actionId: "pipeline-notes",
          actionName: "Pipeline Notes",
          attempts: [],
          createdAt: "2026-04-05T10:00:00Z",
          eventId: "sync-1",
          history: [],
          id: "notes:sync-1:pipeline-notes",
          kind: "notes",
          matchId: "match-1",
          meetingId: "doc-alpha-1111",
          model: "gpt-5",
          parseMode: "json",
          prompt: "Summarise the meeting",
          provider: "openai",
          rawOutput: "{}",
          ruleId: "rule-notes",
          ruleName: "Team Notes",
          runId: "run-1",
          status: "generated",
          structured: {
            actionItems: [],
            decisions: [],
            followUps: [],
            highlights: [],
            markdown: "# Candidate notes",
            metadata: undefined,
            participantSummaries: [],
            sections: [],
            summary: "Candidate notes",
            title: "Alpha Sync Notes",
          },
          updatedAt: "2026-04-05T10:05:00Z",
        },
      ],
      issues: [
        {
          detectedAt: "2026-04-05T10:06:00Z",
          detail: "Transcript import is stale.",
          id: "sync-stale:::",
          kind: "sync-stale",
          recoverable: true,
          severity: "error",
          title: "Sync needs attention",
        },
      ],
      runs: [
        {
          actionId: "review",
          actionKind: "ask-user",
          actionName: "Review transcript",
          eventId: "sync-1",
          folders: [],
          id: "run-1",
          matchId: "match-1",
          matchedAt: "2026-04-05T10:04:00Z",
          meetingId: "doc-alpha-1111",
          prompt: "Review before sharing",
          ruleId: "rule-review",
          ruleName: "Team Review",
          startedAt: "2026-04-05T10:04:30Z",
          status: "pending",
          tags: [],
          title: "Alpha Sync",
          transcriptLoaded: true,
          eventKind: "transcript.ready",
        },
      ],
    });

    expect(items.map((item) => item.kind)).toEqual(["issue", "artefact", "run"]);
    expect(items.map((item) => item.bucket)).toEqual(["recovery", "publish", "approval"]);
    expect(items[0]?.title).toBe("Sync needs attention");
    expect(items[1]?.title).toBe("Alpha Sync Notes");
    expect(items[2]?.title).toBe("Alpha Sync");
  });

  test("ignores non-actionable artefacts and completed runs", () => {
    const items = buildGranolaReviewInbox({
      artefacts: [
        {
          actionId: "pipeline-notes",
          actionName: "Pipeline Notes",
          attempts: [],
          createdAt: "2026-04-05T10:00:00Z",
          eventId: "sync-1",
          history: [],
          id: "notes:sync-1:pipeline-notes",
          kind: "notes",
          matchId: "match-1",
          meetingId: "doc-alpha-1111",
          model: "gpt-5",
          parseMode: "json",
          prompt: "Summarise the meeting",
          provider: "openai",
          rawOutput: "{}",
          ruleId: "rule-notes",
          ruleName: "Team Notes",
          runId: "run-1",
          status: "approved",
          structured: {
            actionItems: [],
            decisions: [],
            followUps: [],
            highlights: [],
            markdown: "# Approved",
            metadata: undefined,
            participantSummaries: [],
            sections: [],
            summary: "Approved",
            title: "Approved notes",
          },
          updatedAt: "2026-04-05T10:05:00Z",
        },
      ],
      issues: [],
      runs: [
        {
          actionId: "review",
          actionKind: "ask-user",
          actionName: "Review transcript",
          eventId: "sync-1",
          folders: [],
          id: "run-1",
          matchId: "match-1",
          matchedAt: "2026-04-05T10:04:00Z",
          meetingId: "doc-alpha-1111",
          ruleId: "rule-review",
          ruleName: "Team Review",
          startedAt: "2026-04-05T10:04:30Z",
          status: "completed",
          tags: [],
          title: "Alpha Sync",
          transcriptLoaded: true,
          eventKind: "transcript.ready",
        },
      ],
    });

    expect(items).toEqual([]);
    expect(summariseGranolaReviewInbox(items)).toEqual({
      approval: 0,
      publish: 0,
      recovery: 0,
      total: 0,
    });
  });
});
