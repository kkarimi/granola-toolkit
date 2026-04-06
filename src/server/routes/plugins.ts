import { granolaPluginPath, granolaTransportPaths } from "../../transport.ts";
import { readJsonBody, sendJson, type GranolaServerRouteContext } from "../http-utils.ts";

export async function handlePluginRoute(context: GranolaServerRouteContext): Promise<boolean> {
  const { app, method, originHeaders, path, request, response } = context;

  if (method === "GET" && path === granolaTransportPaths.plugins) {
    sendJson(response, await app.listPlugins(), { headers: originHeaders });
    return true;
  }

  if (method === "POST" && path === granolaPluginPath("automation")) {
    const body = await readJsonBody(request);
    if (typeof body.enabled !== "boolean") {
      throw new Error("plugin enabled flag is required");
    }

    sendJson(response, await app.setPluginEnabled("automation", body.enabled), {
      headers: originHeaders,
    });
    return true;
  }

  return false;
}
