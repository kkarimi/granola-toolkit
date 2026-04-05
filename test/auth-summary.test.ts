import { describe, expect, test } from "vite-plus/test";

import { granolaAuthModeLabel, granolaAuthRecommendation } from "../src/auth-summary.ts";

describe("granolaAuthModeLabel", () => {
  test("labels the API-key mode as the preferred Personal API key path", () => {
    expect(granolaAuthModeLabel("api-key")).toBe("Personal API key");
    expect(granolaAuthModeLabel("stored-session")).toBe("Stored session");
    expect(granolaAuthModeLabel("supabase-file")).toBe("supabase.json fallback");
  });
});

describe("granolaAuthRecommendation", () => {
  test("reports when the recommended API-key path is already active", () => {
    expect(
      granolaAuthRecommendation({
        apiKeyAvailable: true,
        mode: "api-key",
        refreshAvailable: false,
        storedSessionAvailable: false,
        supabaseAvailable: false,
      }),
    ).toEqual({
      detail:
        "This is the recommended default for long-running sync, web, and automation workflows.",
      status: "Recommended auth active",
    });
  });

  test("guides the user toward switching to a stored API key when one exists", () => {
    expect(
      granolaAuthRecommendation({
        apiKeyAvailable: true,
        mode: "stored-session",
        refreshAvailable: true,
        storedSessionAvailable: true,
        supabaseAvailable: true,
      }),
    ).toEqual({
      detail:
        "A stored Personal API key is available. Switch to it for the cleanest background-service auth path.",
      nextAction: "granola auth use api-key",
      status: "Stored API key available",
    });
  });
});
