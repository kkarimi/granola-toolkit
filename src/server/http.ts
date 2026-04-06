import { createServer, type Server as HttpServer } from "node:http";
import { type AddressInfo, type Socket } from "node:net";

import type { GranolaApp } from "../app/core.ts";
import { resolveGranolaBuildInfo } from "../build-info.ts";
import { defaultGranolaToolkitPersistenceLayout } from "../persistence/layout.ts";
import {
  GRANOLA_TRANSPORT_PROTOCOL_VERSION,
  type GranolaServerInfo,
  type GranolaServerRuntimeMode,
} from "../transport.ts";
import {
  allowedOriginHeaders,
  isPasswordAuthenticated,
  isTrustedOrigin,
  publicRoute,
} from "./http-security.ts";
import { PASSWORD_COOKIE_NAME, sendJson, sendNoContent, sendText } from "./http-utils.ts";
import type { GranolaServerRouteHandler } from "./http-utils.ts";
import { handleAuthRoute } from "./routes/auth.ts";
import { handleAutomationRoute } from "./routes/automation.ts";
import { handleCatalogRoute } from "./routes/catalog.ts";
import { handleExportRoute } from "./routes/exports.ts";
import { handlePluginRoute } from "./routes/plugins.ts";
import { handlePublicRoute } from "./routes/public.ts";
import { handleSyncRoute } from "./routes/sync.ts";

export interface GranolaServer {
  app: GranolaApp;
  close(): Promise<void>;
  hostname: string;
  port: number;
  server: HttpServer;
  url: URL;
}

export interface GranolaServerSecurityOptions {
  password?: string;
  trustedOrigins?: string[];
}

export interface GranolaServerOptions {
  enableWebClient?: boolean;
  hostname?: string;
  port?: number;
  runtime?: {
    mode?: GranolaServerRuntimeMode;
    startedAt?: string;
    syncEnabled?: boolean;
    syncIntervalMs?: number;
  };
  security?: GranolaServerSecurityOptions;
}

function routeHandlers(): GranolaServerRouteHandler[] {
  return [
    handlePublicRoute,
    handleSyncRoute,
    handleAuthRoute,
    handlePluginRoute,
    handleAutomationRoute,
    handleCatalogRoute,
    handleExportRoute,
  ];
}

export async function startGranolaServer(
  app: GranolaApp,
  options: GranolaServerOptions = {},
): Promise<GranolaServer> {
  const enableWebClient = options.enableWebClient ?? false;
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  const runtime = {
    mode:
      options.runtime?.mode ?? (enableWebClient ? ("web-workspace" as const) : ("server" as const)),
    startedAt: options.runtime?.startedAt ?? new Date().toISOString(),
    syncEnabled: options.runtime?.syncEnabled ?? false,
    syncIntervalMs: options.runtime?.syncIntervalMs,
  };
  const security = {
    password: options.security?.password?.trim() || undefined,
    trustedOrigins: (options.security?.trustedOrigins ?? [])
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
  const serverInfo: GranolaServerInfo = {
    build: resolveGranolaBuildInfo(),
    capabilities: {
      attach: true,
      auth: true,
      automation: true,
      events: true,
      exports: true,
      folders: true,
      meetingOpen: true,
      plugins: true,
      processing: true,
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
    runtime,
    transport: "local-http",
  };

  const handlers = routeHandlers();
  const sockets = new Set<Socket>();
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

      if (
        security.password &&
        !publicRoute(path, enableWebClient) &&
        !isPasswordAuthenticated(request, security.password, PASSWORD_COOKIE_NAME)
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

      for (const handleRoute of handlers) {
        const handled = await handleRoute({
          app,
          enableWebClient,
          method,
          originHeaders,
          path,
          request,
          response,
          securityPassword: security.password,
          serverInfo,
          url,
        });
        if (handled) {
          return;
        }
      }

      sendText(response, "Not found\n", 404, originHeaders);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, { error: message }, { headers: originHeaders, status: 400 });
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
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
      const closePromise = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      for (const socket of sockets) {
        socket.destroy();
      }
      await closePromise;
    },
    hostname,
    port: resolved.port,
    server,
    url,
  };
}
