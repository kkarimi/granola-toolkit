import type { GranolaAppAuthState } from "./app/index.ts";

export function granolaAuthModeLabel(mode: GranolaAppAuthState["mode"]): string {
  switch (mode) {
    case "api-key":
      return "Personal API key";
    case "stored-session":
      return "Stored session";
    default:
      return "supabase.json fallback";
  }
}

export function granolaAuthRecommendation(auth: GranolaAppAuthState): {
  detail: string;
  nextAction?: string;
  status: string;
} {
  if (auth.mode === "api-key") {
    return {
      detail:
        "This is the recommended default for long-running sync, web, and automation workflows.",
      status: "Recommended auth active",
    };
  }

  if (auth.apiKeyAvailable) {
    return {
      detail:
        "A stored Personal API key is available. Switch to it for the cleanest background-service auth path.",
      nextAction: "granola auth use api-key",
      status: "Stored API key available",
    };
  }

  return {
    detail:
      "Recommended: create a Personal API key in Granola Settings -> API. Desktop-session import remains available as a fallback.",
    nextAction: "granola auth login --api-key grn_...",
    status: "No stored API key yet",
  };
}
