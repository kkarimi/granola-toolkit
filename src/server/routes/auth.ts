import { granolaTransportPaths } from "../../transport.ts";
import {
  clearPasswordCookieHeader,
  parseAuthMode,
  readJsonBody,
  sendJson,
  type GranolaServerRouteContext,
} from "../http-utils.ts";

export async function handleAuthRoute(context: GranolaServerRouteContext): Promise<boolean> {
  const { app, method, originHeaders, path, response } = context;

  if (method === "GET" && path === granolaTransportPaths.authStatus) {
    sendJson(response, await app.inspectAuth(), { headers: originHeaders });
    return true;
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
    return true;
  }

  if (method === "POST" && path === granolaTransportPaths.authLogin) {
    const body = await readJsonBody(context.request);
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;
    const supabasePath =
      typeof body.supabasePath === "string" && body.supabasePath.trim()
        ? body.supabasePath.trim()
        : undefined;
    sendJson(response, await app.loginAuth({ apiKey, supabasePath }), {
      headers: originHeaders,
    });
    return true;
  }

  if (method === "POST" && path === granolaTransportPaths.authApiKeyClear) {
    sendJson(response, await app.clearApiKeyAuth(), { headers: originHeaders });
    return true;
  }

  if (method === "POST" && path === granolaTransportPaths.authLogout) {
    sendJson(response, await app.logoutAuth(), { headers: originHeaders });
    return true;
  }

  if (method === "POST" && path === granolaTransportPaths.authRefresh) {
    sendJson(response, await app.refreshAuth(), { headers: originHeaders });
    return true;
  }

  if (method === "POST" && path === granolaTransportPaths.authMode) {
    const body = await readJsonBody(context.request);
    sendJson(response, await app.switchAuthMode(parseAuthMode(body.mode)), {
      headers: originHeaders,
    });
    return true;
  }

  return false;
}
