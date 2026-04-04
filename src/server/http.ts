import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { type AddressInfo } from "node:net";

import type { GranolaApp } from "../app/core.ts";
import type {
  GranolaAppStateEvent,
  GranolaMeetingSort,
  NoteOutputFormat,
  TranscriptOutputFormat,
} from "../app/index.ts";
import { renderGranolaWebPage } from "./web.ts";

interface JsonResponseInit {
  status?: number;
}

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

function sendJson(response: ServerResponse, body: unknown, init: JsonResponseInit = {}): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(init.status ?? 200, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(payload);
}

function sendText(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(body);
}

function sendHtml(response: ServerResponse, body: string, status = 200): void {
  response.writeHead(status, {
    "content-length": Buffer.byteLength(body),
    "content-type": "text/html; charset=utf-8",
  });
  response.end(body);
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
}

export async function startGranolaServer(
  app: GranolaApp,
  options: GranolaServerOptions = {},
): Promise<GranolaServer> {
  const enableWebClient = options.enableWebClient ?? false;
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${hostname}`);
    const path = url.pathname;

    try {
      if (method === "GET" && path === "/" && enableWebClient) {
        sendHtml(response, renderGranolaWebPage());
        return;
      }

      if (method === "GET" && path === "/health") {
        sendJson(response, {
          ok: true,
          service: "granola-toolkit",
          version: app.config ? undefined : undefined,
        });
        return;
      }

      if (method === "GET" && path === "/state") {
        sendJson(response, app.getState());
        return;
      }

      if (method === "GET" && path === "/events") {
        response.writeHead(200, {
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "content-type": "text/event-stream; charset=utf-8",
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

      if (method === "GET" && path === "/meetings") {
        const limit = parseInteger(url.searchParams.get("limit"));
        const search = url.searchParams.get("search")?.trim() || undefined;
        const sort = parseMeetingSort(url.searchParams.get("sort"));
        const updatedFrom = url.searchParams.get("updatedFrom")?.trim() || undefined;
        const updatedTo = url.searchParams.get("updatedTo")?.trim() || undefined;
        const meetings = await app.listMeetings({ limit, search, sort, updatedFrom, updatedTo });
        sendJson(response, {
          meetings,
          search,
          sort,
          updatedFrom,
          updatedTo,
        });
        return;
      }

      if (method === "GET" && path === "/meetings/resolve") {
        const query = url.searchParams.get("q")?.trim();
        if (!query) {
          throw new Error("meeting query is required");
        }

        const meeting = await app.findMeeting(query, {
          requireCache: url.searchParams.get("includeTranscript") === "true",
        });
        sendJson(response, meeting);
        return;
      }

      if (method === "GET" && path.startsWith("/meetings/")) {
        const id = decodeURIComponent(path.slice("/meetings/".length));
        if (!id) {
          throw new Error("meeting id is required");
        }

        const meeting = await app.getMeeting(id, {
          requireCache: url.searchParams.get("includeTranscript") === "true",
        });
        sendJson(response, meeting);
        return;
      }

      if (method === "POST" && path === "/exports/notes") {
        const body = await readJsonBody(request);
        const result = await app.exportNotes(noteFormatFromBody(body.format));
        sendJson(response, result, { status: 202 });
        return;
      }

      if (method === "GET" && path === "/exports/jobs") {
        const limit = parseInteger(url.searchParams.get("limit"));
        const result = await app.listExportJobs({ limit });
        sendJson(response, result);
        return;
      }

      if (method === "POST" && path.startsWith("/exports/jobs/") && path.endsWith("/rerun")) {
        const id = decodeURIComponent(path.slice("/exports/jobs/".length, -"/rerun".length));
        if (!id) {
          throw new Error("export job id is required");
        }

        const result = await app.rerunExportJob(id);
        sendJson(response, result, { status: 202 });
        return;
      }

      if (method === "POST" && path === "/exports/transcripts") {
        const body = await readJsonBody(request);
        const result = await app.exportTranscripts(transcriptFormatFromBody(body.format));
        sendJson(response, result, { status: 202 });
        return;
      }

      sendText(response, "Not found\n", 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, { error: message }, { status: 400 });
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
