import { existsSync } from "node:fs";

import { createDefaultSessionStore, SupabaseFileSessionSource } from "../client/auth.ts";
import { firstExistingPath, granolaSupabaseCandidates } from "../utils.ts";

import type { CommandDefinition } from "./types.ts";

function authHelp(): string {
  return `Granola auth

Usage:
  granola auth <login|status|logout>

Subcommands:
  login               Import credentials from the Granola desktop app
  status              Show whether a stored Granola session is available
  logout              Delete the stored Granola session

Options:
  --supabase <path>   Path to supabase.json for auth login
  -h, --help          Show help
`;
}

export const authCommand: CommandDefinition = {
  description: "Manage stored Granola sessions",
  flags: {
    help: { type: "boolean" },
  },
  help: authHelp,
  name: "auth",
  async run({ commandArgs, globalFlags }) {
    const [action] = commandArgs;

    switch (action) {
      case "login":
        return await login(globalFlags.supabase);
      case "logout":
        return await logout();
      case "status":
        return await status();
      case undefined:
        console.log(authHelp());
        return 1;
      default:
        throw new Error("invalid auth command: expected login, status, or logout");
    }
  },
};

async function login(supabaseFlag: string | boolean | undefined): Promise<number> {
  const supabasePath =
    (typeof supabaseFlag === "string" && supabaseFlag.trim()) ||
    firstExistingPath(granolaSupabaseCandidates());

  if (!supabasePath) {
    throw new Error(
      `supabase.json not found. Pass --supabase or create .granola.toml. Expected locations include: ${granolaSupabaseCandidates().join(", ")}`,
    );
  }

  if (!existsSync(supabasePath)) {
    throw new Error(`supabase.json not found: ${supabasePath}`);
  }

  const sessionStore = createDefaultSessionStore();
  const sessionSource = new SupabaseFileSessionSource(supabasePath);
  const session = await sessionSource.loadSession();

  await sessionStore.writeSession(session);
  console.log(`Imported Granola session from ${supabasePath}`);
  return 0;
}

async function status(): Promise<number> {
  const sessionStore = createDefaultSessionStore();
  const session = await sessionStore.readSession();

  if (!session) {
    console.log("No stored Granola session");
    return 1;
  }

  console.log("Stored Granola session");
  console.log(`Client ID: ${session.clientId}`);
  console.log(`Refresh token: ${session.refreshToken ? "available" : "missing"}`);
  console.log(`Sign-in method: ${session.signInMethod ?? "unknown"}`);
  return 0;
}

async function logout(): Promise<number> {
  const sessionStore = createDefaultSessionStore();
  await sessionStore.clearSession();
  console.log("Stored Granola session deleted");
  return 0;
}
