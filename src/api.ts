import type { GranolaDocument } from "./types.ts";
import {
  CachedTokenProvider,
  NoopTokenStore,
  SupabaseContentsTokenSource,
  getAccessTokenFromSupabaseContents,
} from "./client/auth.ts";
import { GranolaApiClient } from "./client/granola.ts";
import { AuthenticatedHttpClient, type FetchLike } from "./client/http.ts";
import { parseDocument } from "./client/parsers.ts";

export { parseDocument } from "./client/parsers.ts";
export type { FetchLike } from "./client/http.ts";

export function getAccessToken(supabaseContents: string): string {
  return getAccessTokenFromSupabaseContents(supabaseContents);
}

export async function fetchDocuments(options: {
  fetchImpl?: FetchLike;
  logger?: Pick<Console, "error" | "warn">;
  supabaseContents: string;
  timeoutMs: number;
  url?: string;
}): Promise<GranolaDocument[]> {
  const tokenSource = new SupabaseContentsTokenSource(options.supabaseContents);
  const tokenProvider = new CachedTokenProvider(tokenSource, new NoopTokenStore());
  const httpClient = new AuthenticatedHttpClient({
    fetchImpl: options.fetchImpl,
    logger: options.logger,
    tokenProvider,
  });
  const apiClient = new GranolaApiClient(httpClient, options.url);
  return apiClient.listDocuments({ timeoutMs: options.timeoutMs });
}
