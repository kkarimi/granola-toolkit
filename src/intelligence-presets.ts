import { GranolaCapabilityRegistry } from "./registry.ts";

export interface GranolaIntelligencePreset {
  description: string;
  id: string;
  label: string;
  prompt: string;
}

export type GranolaIntelligencePresetRegistry = GranolaCapabilityRegistry<
  GranolaIntelligencePreset["id"],
  GranolaIntelligencePreset
>;

const COMMON_OUTPUT_REQUIREMENTS = [
  "Return valid JSON only.",
  "Use this shape:",
  '{ "title": string, "summary": string, "highlights": string[], "decisions": string[], "followUps": string[], "actionItems": [{ "title": string, "owner"?: string, "ownerEmail"?: string, "ownerRole"?: "you" | "participant", "dueDate"?: string }], "sections": [{ "title": string, "body": string }], "participantSummaries"?: [{ "speaker": string, "role"?: "you" | "participant", "summary": string, "actionItems": string[] }], "metadata"?: object, "markdown": string }',
  "If a field has no evidence, return an empty array or omit the optional object.",
  "Keep markdown readable and concise.",
].join("\n");

export function createGranolaIntelligencePresetRegistry(): GranolaIntelligencePresetRegistry {
  return new GranolaCapabilityRegistry();
}

export function createDefaultGranolaIntelligencePresetRegistry(): GranolaIntelligencePresetRegistry {
  return createGranolaIntelligencePresetRegistry()
    .register("people", {
      description: "Who was involved, their roles, and what each person committed to.",
      id: "people",
      label: "People",
      prompt: [
        "Extract the people intelligence from this meeting.",
        "Focus on attendees, roles, commitments, owners, and who needs follow-up.",
        "Use participantSummaries when the transcript makes speaker-level summaries possible.",
        'Set metadata.preset to "people".',
        COMMON_OUTPUT_REQUIREMENTS,
      ].join("\n\n"),
    })
    .register("companies", {
      description: "Which companies, vendors, customers, and tools came up and why they matter.",
      id: "companies",
      label: "Companies",
      prompt: [
        "Extract organisation and tool intelligence from this meeting.",
        "Focus on companies, customers, vendors, internal teams, products, and tools that were discussed.",
        "Use sections such as Companies, Relationships, Risks, and Follow-ups when useful.",
        'Set metadata.preset to "companies".',
        COMMON_OUTPUT_REQUIREMENTS,
      ].join("\n\n"),
    })
    .register("action-items", {
      description: "Action items, owners, due dates, and loose ends worth tracking.",
      id: "action-items",
      label: "Action items",
      prompt: [
        "Extract the actionable work from this meeting.",
        "Focus on explicit and strongly implied action items, owners, due dates, dependencies, and next steps.",
        "Prefer precise actionItems over generic highlights.",
        'Set metadata.preset to "action-items".',
        COMMON_OUTPUT_REQUIREMENTS,
      ].join("\n\n"),
    })
    .register("decisions", {
      description: "Decisions made, what was deferred, and what remains unresolved.",
      id: "decisions",
      label: "Decisions",
      prompt: [
        "Extract the decision record from this meeting.",
        "Focus on decisions made, tradeoffs discussed, blocked decisions, and open questions.",
        "Use sections such as Decided, Deferred, and Open Questions when useful.",
        'Set metadata.preset to "decisions".',
        COMMON_OUTPUT_REQUIREMENTS,
      ].join("\n\n"),
    })
    .register("insights", {
      description: "Insights, blockers, themes, and signals worth carrying forward.",
      id: "insights",
      label: "Insights",
      prompt: [
        "Extract the most useful insights from this meeting.",
        "Focus on product insight, customer signal, operational risk, blockers, emerging themes, and notable context.",
        "Prioritise what a teammate would want to remember later, not a minute-by-minute recap.",
        'Set metadata.preset to "insights".',
        COMMON_OUTPUT_REQUIREMENTS,
      ].join("\n\n"),
    });
}

const defaultRegistry = createDefaultGranolaIntelligencePresetRegistry();

export function listGranolaIntelligencePresets(): GranolaIntelligencePreset[] {
  return defaultRegistry.entries().map(([, preset]) => ({ ...preset }));
}

export function resolveGranolaIntelligencePreset(
  value: string,
): GranolaIntelligencePreset | undefined {
  const query = value.trim().toLowerCase();
  if (!query || !defaultRegistry.has(query)) {
    return undefined;
  }

  return { ...defaultRegistry.resolve(query, "intelligence preset") };
}
