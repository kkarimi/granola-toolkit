import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { type AddressInfo } from "node:net";

import type { GranolaApp } from "../app/core.ts";
import { defaultGranolaToolkitPersistenceLayout } from "../persistence/layout.ts";
import {
  granolaTransportPaths,
  GRANOLA_TRANSPORT_PROTOCOL_VERSION,
  type GranolaServerInfo,
} from "../transport.ts";
import type {
  GranolaAppAuthMode,
  GranolaAppStateEvent,
  GranolaMeetingSort,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../app/index.ts";
import { granolaWebAssetForPath } from "../web/assets.ts";
import { renderGranolaWebPage } from "./web.ts";

interface JsonResponseInit {
  headers?: Record<string, string>;
  status?: number;
}

interface GranolaServerSecurityOptions {
  password?: string;
  trustedOrigins?: string[];
}

const PASSWORD_COOKIE_NAME = "granola_toolkit_password";

function parseInteger(value: string | null): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("invalid limit: expected a positive integer");
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("invalid limit: expected a positive integer");
  }

  return parsed;
}

function parseMeetingSort(value: string | null): GranolaMeetingSort | undefined {
  switch (value) {
    case null:
    case "":
      return undefined;
    case "title-asc":
    case "title-desc":
    case "updated-asc":
    case "updated-desc":
      return value;
    default:
      throw new Error("invalid sort: expected updated-desc, updated-asc, title-asc, or title-desc");
  }
}

function parseAuthMode(value: unknown): GranolaAppAuthMode {
  switch (value) {
    case "api-key":
    case "stored-session":
    case "supabase-file":
      return value;
    default:
      throw new Error("invalid auth mode: expected api-key, stored-session, or supabase-file");
  }
}

function folderIdFromBody(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sendJson(response: ServerResponse, body: unknown, init: JsonResponseInit = {}): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(init.status ?? 200, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
    ...init.headers,
  });
  response.end(payload);
}

function sendText(
  response: ServerResponse,
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(body);
}

function sendHtml(
  response: ServerResponse,
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "text/html; charset=utf-8",
    ...headers,
  });
  response.end(body);
}

function sendNoContent(
  response: ServerResponse,
  status = 204,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, headers);
  response.end();
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("request body must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "failed to parse JSON body");
  }
}

function formatSseEvent(event: GranolaAppStateEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function noteFormatFromBody(value: unknown): NoteOutputFormat {
  switch (value) {
    case undefined:
    case "markdown":
      return "markdown";
    case "json":
    case "raw":
    case "yaml":
      return value;
    default:
      throw new Error("invalid notes format: expected markdown, json, yaml, or raw");
  }
}

function transcriptFormatFromBody(value: unknown): TranscriptOutputFormat {
  switch (value) {
    case undefined:
    case "text":
      return "text";
    case "json":
    case "raw":
    case "yaml":
      return value;
    default:
      throw new Error("invalid transcript format: expected text, json, yaml, or raw");
  }
}

function parseCookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const chunk of header.split(";")) {
    const [name, ...valueParts] = chunk.trim().split("=");
    if (!name) {
      continue;
    }

    cookies[name] = decodeURIComponent(valueParts.join("="));
  }

  return cookies;
}

function passwordCookieHeader(password: string): string {
  return `${PASSWORD_COOKIE_NAME}=${encodeURIComponent(password)}; HttpOnly; Path=/; SameSite=Strict`;
}

function clearPasswordCookieHeader(): string {
  return `${PASSWORD_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`;
}

function allowedOriginHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, x-granola-password",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": origin,
    vary: "Origin",
  };
}

function isTrustedOrigin(
  origin: string | undefined,
  request: IncomingMessage,
  trustedOrigins: string[],
): boolean {
  if (!origin) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const host = request.headers.host;
    if (host && parsed.host === host) {
      return true;
    }
  } catch {
    return false;
  }

  return trustedOrigins.includes(origin);
}

function isPasswordAuthenticated(request: IncomingMessage, password: string): boolean {
  const headerPassword = request.headers["x-granola-password"];
  if (typeof headerPassword === "string" && headerPassword === password) {
    return true;
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length) === password;
  }

  return parseCookies(request)[PASSWORD_COOKIE_NAME] === password;
}

function publicRoute(path: string, enableWebClient: boolean): boolean {
  return (
    path === granolaTransportPaths.health ||
    path === granolaTransportPaths.serverInfo ||
    path === granolaTransportPaths.authUnlock ||
    (enableWebClient &&
      (path === granolaTransportPaths.root || Boolean(granolaWebAssetForPath(path))))
  );
}

export interface GranolaServer {
  app: GranolaApp;
  close(): Promise<void>;
  hostname: string;
  port: number;
  server: HttpServer;
  url: URL;
}

export interface GranolaServerOptions {
  enableWebClient?: boolean;
  hostname?: string;
  port?: number;
  security?: GranolaServerSecurityOptions;
}

export async function startGranolaServer(
  app: GranolaApp,
  options: GranolaServerOptions = {},
): Promise<GranolaServer> {
  const enableWebClient = options.enableWebClient ?? false;
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  const security = {
    password: options.security?.password?.trim() || undefined,
    trustedOrigins: (options.security?.trustedOrigins ?? [])
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
  const serverInfo: GranolaServerInfo = {
    capabilities: {
      attach: true,
      auth: true,
      events: true,
      exports: true,
      folders: true,
      meetingOpen: true,
      sync: true,
      webClient: enableWebClient,
    },
    persistence: {
      exportJobs: true,
      meetingIndex: true,
      sessionStore: defaultGranolaToolkitPersistenceLayout().sessionStoreKind,
      syncEvents: true,
      syncState: true,
    },
    product: "granola-toolkit",
    protocolVersion: GRANOLA_TRANSPORT_PROTOCOL_VERSION,
    transport: "local-http",
  };

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${hostname}`);
    const path = url.pathname;
    const origin = request.headers.origin?.trim();
    const trustedOrigin = isTrustedOrigin(origin, request, security.trustedOrigins);
    const originHeaders = origin && trustedOrigin ? allowedOriginHeaders(origin) : {};

    try {
      if (origin && !trustedOrigin) {
        sendJson(
          response,
          { error: `origin not trusted: ${origin}` },
          { headers: originHeaders, status: 403 },
        );
        return;
      }

      if (method === "OPTIONS") {
        if (!origin) {
          sendNoContent(response, 204);
          return;
        }

        if (!trustedOrigin) {
          sendNoContent(response, 403);
          return;
        }

        sendNoContent(response, 204, originHeaders);
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.root && enableWebClient) {
        sendHtml(
          response,
          renderGranolaWebPage({
            serverPasswordRequired: Boolean(security.password),
          }),
          200,
          originHeaders,
        );
        return;
      }

      if (method === "GET" && enableWebClient) {
        const asset = granolaWebAssetForPath(path);
        if (asset) {
          response.writeHead(200, {
            "content-length": Buffer.byteLength(asset.body),
            "content-type": asset.contentType,
            ...originHeaders,
          });
          response.end(asset.body);
          return;
        }
      }

      if (method === "GET" && path === granolaTransportPaths.health) {
        sendJson(
          response,
          {
            ok: true,
            service: "granola-toolkit",
            version: app.config ? undefined : undefined,
          },
          { headers: originHeaders },
        );
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.serverInfo) {
        sendJson(response, serverInfo, { headers: originHeaders });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.authUnlock) {
        if (!security.password) {
          sendJson(response, { ok: true, passwordRequired: false }, { headers: originHeaders });
          return;
        }

        const body = await readJsonBody(request);
        const password =
          typeof body.password === "string" && body.password.trim() ? body.password : undefined;
        if (!password || password !== security.password) {
          sendJson(
            response,
            {
              authRequired: true,
              error: "invalid server password",
            },
            { headers: originHeaders, status: 401 },
          );
          return;
        }

        sendJson(
          response,
          {
            ok: true,
            passwordRequired: true,
          },
          {
            headers: {
              ...originHeaders,
              "set-cookie": passwordCookieHeader(security.password),
            },
          },
        );
        return;
      }

      if (
        security.password &&
        !publicRoute(path, enableWebClient) &&
        !isPasswordAuthenticated(request, security.password)
      ) {
        sendJson(
          response,
          {
            authRequired: true,
            error: "server password required",
          },
          { headers: originHeaders, status: 401 },
        );
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.state) {
        sendJson(response, app.getState(), { headers: originHeaders });
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.authStatus) {
        sendJson(response, await app.inspectAuth(), { headers: originHeaders });
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.automationRules) {
        sendJson(response, await app.listAutomationRules(), { headers: originHeaders });
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.automationMatches) {
        sendJson(
          response,
          await app.listAutomationMatches({
            limit: parseInteger(url.searchParams.get("limit")),
          }),
          { headers: originHeaders },
        );
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.syncRun) {
        const body = await readJsonBody(request);
        sendJson(
          response,
          await app.sync({
            foreground: typeof body.foreground === "boolean" ? body.foreground : undefined,
            forceRefresh: typeof body.forceRefresh === "boolean" ? body.forceRefresh : undefined,
          }),
          { headers: originHeaders },
        );
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.syncEvents) {
        sendJson(
          response,
          await app.listSyncEvents({
            limit: parseInteger(url.searchParams.get("limit")) ?? 20,
          }),
          { headers: originHeaders },
        );
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.authLock) {
        sendJson(
          response,
          { ok: true },
          {
            headers: {
              ...originHeaders,
              "set-cookie": clearPasswordCookieHeader(),
            },
          },
        );
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.events) {
        response.writeHead(200, {
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "content-type": "text/event-stream; charset=utf-8",
          ...originHeaders,
        });
        response.write(
          formatSseEvent({
            state: app.getState(),
            timestamp: new Date().toISOString(),
            type: "state.updated",
          }),
        );
        const unsubscribe = app.subscribe((event) => {
          response.write(formatSseEvent(event));
        });
        request.on("close", () => {
          unsubscribe();
          response.end();
        });
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.meetings) {
        const folderId = url.searchParams.get("folderId")?.trim() || undefined;
        const limit = parseInteger(url.searchParams.get("limit"));
        const refresh = url.searchParams.get("refresh") === "true";
        const search = url.searchParams.get("search")?.trim() || undefined;
        const sort = parseMeetingSort(url.searchParams.get("sort"));
        const updatedFrom = url.searchParams.get("updatedFrom")?.trim() || undefined;
        const updatedTo = url.searchParams.get("updatedTo")?.trim() || undefined;
        const result = await app.listMeetings({
          folderId,
          forceRefresh: refresh,
          limit,
          search,
          sort,
          updatedFrom,
          updatedTo,
        });
        sendJson(
          response,
          {
            folderId,
            meetings: result.meetings,
            refresh,
            search,
            source: result.source,
            sort,
            updatedFrom,
            updatedTo,
          },
          { headers: originHeaders },
        );
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.folders) {
        const limit = parseInteger(url.searchParams.get("limit"));
        const refresh = url.searchParams.get("refresh") === "true";
        const search = url.searchParams.get("search")?.trim() || undefined;
        const result = await app.listFolders({
          forceRefresh: refresh,
          limit,
          search,
        });
        sendJson(
          response,
          {
            folders: result.folders,
            refresh,
            search,
          },
          { headers: originHeaders },
        );
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.folderResolve) {
        const query = url.searchParams.get("q")?.trim();
        if (!query) {
          throw new Error("folder query is required");
        }

        const folder = await app.findFolder(query);
        sendJson(response, folder, { headers: originHeaders });
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.meetingResolve) {
        const query = url.searchParams.get("q")?.trim();
        if (!query) {
          throw new Error("meeting query is required");
        }

        const meeting = await app.findMeeting(query, {
          requireCache: url.searchParams.get("includeTranscript") === "true",
        });
        sendJson(response, meeting, { headers: originHeaders });
        return;
      }

      if (
        method === "GET" &&
        path.startsWith(`${granolaTransportPaths.folders}/`) &&
        path !== granolaTransportPaths.folderResolve
      ) {
        const id = decodeURIComponent(path.slice(`${granolaTransportPaths.folders}/`.length));
        if (!id) {
          throw new Error("folder id is required");
        }

        const folder = await app.getFolder(id);
        sendJson(response, folder, { headers: originHeaders });
        return;
      }

      if (
        method === "GET" &&
        path.startsWith(`${granolaTransportPaths.meetings}/`) &&
        path !== granolaTransportPaths.meetingResolve
      ) {
        const id = decodeURIComponent(path.slice(`${granolaTransportPaths.meetings}/`.length));
        if (!id) {
          throw new Error("meeting id is required");
        }

        const meeting = await app.getMeeting(id, {
          requireCache: url.searchParams.get("includeTranscript") === "true",
        });
        sendJson(response, meeting, { headers: originHeaders });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.authLogin) {
        const body = await readJsonBody(request);
        const apiKey =
          typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
        const supabasePath =
          typeof body.supabasePath === "string" && body.supabasePath.trim()
            ? body.supabasePath.trim()
            : undefined;
        sendJson(response, await app.loginAuth({ apiKey, supabasePath }), {
          headers: originHeaders,
        });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.authLogout) {
        sendJson(response, await app.logoutAuth(), { headers: originHeaders });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.authRefresh) {
        sendJson(response, await app.refreshAuth(), { headers: originHeaders });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.authMode) {
        const body = await readJsonBody(request);
        sendJson(response, await app.switchAuthMode(parseAuthMode(body.mode)), {
          headers: originHeaders,
        });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.exportNotes) {
        const body = await readJsonBody(request);
        const result = await app.exportNotes(noteFormatFromBody(body.format), {
          folderId: folderIdFromBody(body.folderId),
        });
        sendJson(response, result, { headers: originHeaders, status: 202 });
        return;
      }

      if (method === "GET" && path === granolaTransportPaths.exportJobs) {
        const limit = parseInteger(url.searchParams.get("limit"));
        const result = await app.listExportJobs({ limit });
        sendJson(response, result, { headers: originHeaders });
        return;
      }

      if (
        method === "POST" &&
        path.startsWith(`${granolaTransportPaths.exportJobs}/`) &&
        path.endsWith("/rerun")
      ) {
        const id = decodeURIComponent(
          path.slice(`${granolaTransportPaths.exportJobs}/`.length, -"/rerun".length),
        );
        if (!id) {
          throw new Error("export job id is required");
        }

        const result = await app.rerunExportJob(id);
        sendJson(response, result, { headers: originHeaders, status: 202 });
        return;
      }

      if (method === "POST" && path === granolaTransportPaths.exportTranscripts) {
        const body = await readJsonBody(request);
        const result = await app.exportTranscripts(transcriptFormatFromBody(body.format), {
          folderId: folderIdFromBody(body.folderId),
        });
        sendJson(response, result, { headers: originHeaders, status: 202 });
        return;
      }

      sendText(response, "Not found\n", 404, originHeaders);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, { error: message }, { headers: originHeaders, status: 400 });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to resolve server address");
  }

  const resolved = address as AddressInfo;
  const url = new URL(`http://${hostname}:${resolved.port}`);

  return {
    app,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
    hostname,
    port: resolved.port,
    server,
    url,
  };
}
