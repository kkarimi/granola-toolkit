import { describe, expect, test } from "vite-plus/test";

import { buildPipelineInstructions, parsePipelineOutput } from "../src/processing.ts";

describe("processing pipelines", () => {
  test("adds structured output instructions for notes pipelines", () => {
    expect(buildPipelineInstructions("notes", "Make this crisp.")).toContain("Return JSON only.");
    expect(buildPipelineInstructions("notes", "Make this crisp.")).toContain("markdown");
  });

  test("parses JSON pipeline output", () => {
    const result = parsePipelineOutput({
      kind: "notes",
      meetingTitle: "Alpha Sync",
      rawOutput: JSON.stringify({
        actionItems: [{ owner: "Nima", title: "Send recap" }],
        decisions: ["Ship it"],
        followUps: ["Confirm date"],
        highlights: ["Budget approved"],
        markdown: "# Alpha\n\n## Summary\n\nShipped.",
        metadata: { source: "model" },
        sections: [{ body: "Shipped.", title: "Summary" }],
        summary: "Shipped.",
        title: "Alpha",
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        parseMode: "json",
        structured: expect.objectContaining({
          actionItems: [expect.objectContaining({ title: "Send recap" })],
          title: "Alpha",
        }),
      }),
    );
  });

  test("normalises action item owners against meeting role helpers", () => {
    const result = parsePipelineOutput({
      kind: "notes",
      meetingTitle: "Alpha Sync",
      rawOutput: JSON.stringify({
        actionItems: [{ owner: "you", title: "Send recap" }],
        decisions: [],
        followUps: [],
        highlights: [],
        markdown: "# Alpha\n\n## Summary\n\nShipped.",
        metadata: {},
        participantSummaries: [
          {
            actionItems: ["Send recap"],
            role: "self",
            speaker: "You",
            summary: "Owned the recap and next steps.",
          },
        ],
        sections: [{ body: "Shipped.", title: "Summary" }],
        summary: "Shipped.",
        title: "Alpha",
      }),
      roleHelpers: {
        ownerCandidates: [
          {
            email: "nima@example.com",
            id: "creator:nima@example.com",
            label: "Nima Karimi",
            role: "self",
            source: "speaker",
          },
        ],
        participants: [],
        speakers: [],
      },
    });

    expect(result.structured.actionItems).toEqual([
      expect.objectContaining({
        owner: "Nima Karimi",
        ownerEmail: "nima@example.com",
        ownerOriginal: "you",
        ownerRole: "self",
      }),
    ]);
    expect(result.structured.participantSummaries).toEqual([
      expect.objectContaining({
        speaker: "You",
        summary: "Owned the recap and next steps.",
      }),
    ]);
  });

  test("falls back to markdown when the model does not return JSON", () => {
    const result = parsePipelineOutput({
      kind: "enrichment",
      meetingTitle: "Alpha Sync",
      rawOutput: "# Alpha\n\nFollow up with finance.",
    });

    expect(result).toEqual(
      expect.objectContaining({
        parseMode: "markdown-fallback",
        structured: expect.objectContaining({
          summary: "Alpha",
          title: "Alpha Sync Enrichment",
        }),
      }),
    );
  });
});
