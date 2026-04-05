import { createGranolaApp, type GranolaAppAuthState } from "../app/index.ts";
import { granolaAuthModeLabel, granolaAuthRecommendation } from "../auth-summary.ts";
import { loadConfig } from "../config.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function authHelp(): string {
  return `Granola auth

Usage:
  granola auth <login|status|logout|refresh|use> [options]

Subcommands:
  login               Recommended: store a Granola Personal API key with --api-key
                      Fallback: import credentials from the Granola desktop app
  status              Show the current Granola auth state
  logout              Delete stored Granola credentials
  refresh             Refresh the stored Granola session
  use <api-key|stored|supabase>
                      Switch the active auth source for this toolkit instance

Options:
  --api-key <token>   Store a Granola Personal API key
  --supabase <path>   Path to supabase.json for auth login
  --config <path>     Path to .granola.toml
  --debug             Enable debug logging
  -h, --help          Show help
`;
}

function formatAuthSource(mode: string): string {
  return granolaAuthModeLabel(mode as GranolaAppAuthState["mode"]);
}

function printAuthState(state: GranolaAppAuthState): void {
  console.log(`Active source: ${formatAuthSource(state.mode)}`);
  const recommendation = granolaAuthRecommendation(state);
  console.log(`Recommended: ${recommendation.status}`);
  console.log(`API key: ${state.apiKeyAvailable ? "available" : "missing"}`);
  console.log(`Stored session: ${state.storedSessionAvailable ? "available" : "missing"}`);
  console.log(`supabase.json: ${state.supabaseAvailable ? "available" : "missing"}`);
  console.log(`Guidance: ${recommendation.detail}`);
  if (recommendation.nextAction) {
    console.log(`Next step: ${recommendation.nextAction}`);
  }
  if (state.supabasePath) {
    console.log(`supabase path: ${state.supabasePath}`);
  }
  if (state.clientId) {
    console.log(`Client ID: ${state.clientId}`);
  }
  console.log(`Refresh token: ${state.refreshAvailable ? "available" : "missing"}`);
  if (state.signInMethod) {
    console.log(`Sign-in method: ${state.signInMethod}`);
  }
  if (state.lastError) {
    console.log(`Last error: ${state.lastError}`);
  }
}

export const authCommand: CommandDefinition = {
  description: "Manage Granola auth sources",
  flags: {
    "api-key": { type: "string" },
    help: { type: "boolean" },
  },
  help: authHelp,
  name: "auth",
  async run({ commandArgs, commandFlags, globalFlags }) {
    const [action, value] = commandArgs;
    const config = await loadConfig({
      globalFlags,
      subcommandFlags: {},
    });

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "supabase", config.supabase);

    const app = await createGranolaApp(config);

    switch (action) {
      case "login": {
        const state = await app.loginAuth({
          apiKey: typeof commandFlags["api-key"] === "string" ? commandFlags["api-key"] : undefined,
        });
        console.log(
          typeof commandFlags["api-key"] === "string"
            ? "Stored Granola API key"
            : `Imported Granola session from ${state.supabasePath ?? "desktop app defaults"}`,
        );
        printAuthState(state);
        return 0;
      }
      case "logout": {
        const state = await app.logoutAuth();
        console.log("Stored Granola credentials deleted");
        printAuthState(state);
        return 0;
      }
      case "refresh": {
        const state = await app.refreshAuth();
        console.log("Stored Granola session refreshed");
        printAuthState(state);
        return 0;
      }
      case "status": {
        const state = await app.inspectAuth();
        printAuthState(state);
        return state.apiKeyAvailable || state.storedSessionAvailable || state.supabaseAvailable
          ? 0
          : 1;
      }
      case "use": {
        const mode = resolveAuthMode(value);
        const state = await app.switchAuthMode(mode);
        console.log(`Switched auth source to ${formatAuthSource(state.mode)}`);
        printAuthState(state);
        return 0;
      }
      case undefined:
        console.log(authHelp());
        return 1;
      default:
        throw new Error("invalid auth command: expected login, status, logout, refresh, or use");
    }
  },
};

function resolveAuthMode(
  value: string | undefined,
): "api-key" | "stored-session" | "supabase-file" {
  switch (value) {
    case "api":
    case "api-key":
      return "api-key";
    case "stored":
    case "stored-session":
      return "stored-session";
    case "supabase":
    case "supabase-file":
      return "supabase-file";
    default:
      throw new Error("invalid auth mode: expected api-key, stored, or supabase");
  }
}
