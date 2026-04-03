import { existsSync } from "node:fs";

import {
  CachedTokenProvider,
  createDefaultSessionStore,
  NoopTokenStore,
  StoredSessionTokenProvider,
  SupabaseFileSessionSource,
  SupabaseFileTokenSource,
} from "../client/auth.ts";
import { GranolaApiClient } from "../client/granola.ts";
import { AuthenticatedHttpClient } from "../client/http.ts";
import { loadConfig } from "../config.ts";
import type { NoteOutputFormat } from "../types.ts";
import { writeNotes } from "../notes.ts";
import { granolaSupabaseCandidates } from "../utils.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function notesHelp(): string {
  return `Granola notes

Usage:
  granola notes [options]

Options:
  --format <value>    Output format: markdown, json, yaml, raw (default: markdown)
  --output <path>     Output directory for note files (default: ./notes)
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

export const notesCommand: CommandDefinition = {
  description: "Export Granola notes",
  flags: {
    format: { type: "string" },
    help: { type: "boolean" },
    output: { type: "string" },
    timeout: { type: "string" },
  },
  help: notesHelp,
  name: "notes",
  async run({ commandFlags, globalFlags }) {
    const config = await loadConfig({
      globalFlags,
      subcommandFlags: commandFlags,
    });

    const sessionStore = createDefaultSessionStore();
    const storedSession = await sessionStore.readSession();

    if (!storedSession && !config.supabase) {
      throw new Error(
        `supabase.json not found. Pass --supabase or create .granola.toml. Expected locations include: ${granolaSupabaseCandidates().join(", ")}`,
      );
    }

    if (!storedSession && config.supabase && !existsSync(config.supabase)) {
      throw new Error(`supabase.json not found: ${config.supabase}`);
    }

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "supabase", config.supabase);
    debug(config.debug, "timeoutMs", config.notes.timeoutMs);
    debug(config.debug, "output", config.notes.output);
    const format = resolveNoteFormat(commandFlags.format);
    debug(config.debug, "format", format);

    console.log("Fetching documents from Granola API...");
    const tokenProvider = storedSession
      ? new StoredSessionTokenProvider(sessionStore, {
          source:
            config.supabase && existsSync(config.supabase)
              ? new SupabaseFileSessionSource(config.supabase)
              : undefined,
        })
      : new CachedTokenProvider(
          new SupabaseFileTokenSource(config.supabase!),
          new NoopTokenStore(),
        );
    const httpClient = new AuthenticatedHttpClient({
      logger: console,
      tokenProvider,
    });
    const granolaClient = new GranolaApiClient(httpClient);
    const documents = await granolaClient.listDocuments({
      timeoutMs: config.notes.timeoutMs,
    });

    console.log(`Exporting ${documents.length} notes to ${config.notes.output}...`);
    const written = await writeNotes(documents, config.notes.output, format);
    console.log("✓ Export completed successfully");
    debug(config.debug, "notes written", written);
    return 0;
  },
};

function resolveNoteFormat(value: string | boolean | undefined): NoteOutputFormat {
  switch (value) {
    case undefined:
      return "markdown";
    case "json":
    case "markdown":
    case "raw":
    case "yaml":
      return value;
    default:
      throw new Error("invalid notes format: expected markdown, json, yaml, or raw");
  }
}
