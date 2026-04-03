import type { AccessTokenProvider } from "./auth.ts";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface HttpRequestOptions {
  body?: RequestInit["body"];
  headers?: Record<string, string>;
  method?: string;
  retryOnUnauthorized?: boolean;
  timeoutMs: number;
  url: string;
}

export class AuthenticatedHttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(options: {
    fetchImpl?: FetchLike;
    logger?: Pick<Console, "warn">;
    tokenProvider: AccessTokenProvider;
  }) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
    this.tokenProvider = options.tokenProvider;
  }

  private readonly logger?: Pick<Console, "warn">;
  private readonly tokenProvider: AccessTokenProvider;

  async request(options: HttpRequestOptions): Promise<Response> {
    const { retryOnUnauthorized = true, timeoutMs, url } = options;
    const accessToken = await this.tokenProvider.getAccessToken();
    const response = await this.fetchImpl(url, {
      body: options.body,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
      method: options.method ?? "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 401 && retryOnUnauthorized) {
      this.logger?.warn?.("request returned 401; invalidating token provider and retrying once");
      await this.tokenProvider.invalidate();
      return this.request({
        ...options,
        retryOnUnauthorized: false,
      });
    }

    return response;
  }

  async postJson(
    url: string,
    body: unknown,
    options: Omit<HttpRequestOptions, "body" | "method" | "url"> = { timeoutMs: 30_000 },
  ): Promise<Response> {
    return this.request({
      ...options,
      body: JSON.stringify(body),
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        ...options.headers,
      },
      method: "POST",
      url,
    });
  }
}
