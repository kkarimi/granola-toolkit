import { CachedTokenProvider, NoopTokenStore, SupabaseFileTokenSource } from "../client/auth.ts";
import { GranolaApiClient } from "../client/granola.ts";
import { AuthenticatedHttpClient } from "../client/http.ts";
import { loadConfig } from "../config.ts";
import { writeNotes } from "../notes.ts";
import { granolaSupabaseCandidates } from "../utils.ts";

import { debug } from "./shared.ts";
import type { CommandDefinition } from "./types.ts";

function notesHelp(): string {
  return `Granola notes

Usage:
  granola notes [options]

Options:
  --output <path>     Output directory for Markdown files (default: ./notes)
  --timeout <value>   Request timeout, e.g. 2m, 30s, 120000 (default: 2m)
  --supabase <path>   Path to supabase.json
  --debug             Enable debug logging
  --config <path>     Path to .granola.toml
  -h, --help          Show help
`;
}

export const notesCommand: CommandDefinition = {
  description: "Export Granola notes to Markdown",
  flags: {
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

    if (!config.supabase) {
      throw new Error(
        `supabase.json not found. Pass --supabase or create .granola.toml. Expected locations include: ${granolaSupabaseCandidates().join(", ")}`,
      );
    }

    debug(config.debug, "using config", config.configFileUsed ?? "(none)");
    debug(config.debug, "supabase", config.supabase);
    debug(config.debug, "timeoutMs", config.notes.timeoutMs);
    debug(config.debug, "output", config.notes.output);

    console.log("Fetching documents from Granola API...");
    const tokenSource = new SupabaseFileTokenSource(config.supabase);
    const tokenProvider = new CachedTokenProvider(tokenSource, new NoopTokenStore());
    const httpClient = new AuthenticatedHttpClient({
      logger: console,
      tokenProvider,
    });
    const granolaClient = new GranolaApiClient(httpClient);
    const documents = await granolaClient.listDocuments({
      timeoutMs: config.notes.timeoutMs,
    });

    console.log(`Exporting ${documents.length} notes to ${config.notes.output}...`);
    const written = await writeNotes(documents, config.notes.output);
    console.log("✓ Export completed successfully");
    debug(config.debug, "notes written", written);
    return 0;
  },
};
