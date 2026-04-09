import { granolaTransportPaths } from "../../transport.ts";
import { parseInteger, sendJson, type GranolaServerRouteContext } from "../http-utils.ts";

export async function handleYazdSourceRoute(context: GranolaServerRouteContext): Promise<boolean> {
  const { app, method, originHeaders, path, response, url } = context;

  if (method === "GET" && path === granolaTransportPaths.yazdSource) {
    sendJson(response, await app.inspectYazdSource(), { headers: originHeaders });
    return true;
  }

  if (method === "GET" && path === granolaTransportPaths.yazdSourceItems) {
    const result = await app.listYazdSourceItems({
      cursor: url.searchParams.get("cursor")?.trim() || undefined,
      folderId: url.searchParams.get("folderId")?.trim() || undefined,
      limit: parseInteger(url.searchParams.get("limit")),
      search: url.searchParams.get("search")?.trim() || undefined,
      since: url.searchParams.get("since")?.trim() || undefined,
    });
    sendJson(response, result, { headers: originHeaders });
    return true;
  }

  if (method === "GET" && path === granolaTransportPaths.yazdSourceChanges) {
    const result = await app.listYazdSourceChanges({
      cursor: url.searchParams.get("cursor")?.trim() || undefined,
      limit: parseInteger(url.searchParams.get("limit")),
      since: url.searchParams.get("since")?.trim() || undefined,
    });
    sendJson(response, result, { headers: originHeaders });
    return true;
  }

  if (
    method === "GET" &&
    path.startsWith(`${granolaTransportPaths.yazdSourceItems}/`) &&
    path !== granolaTransportPaths.yazdSourceItems
  ) {
    const rawId = path.slice(`${granolaTransportPaths.yazdSourceItems}/`.length);
    const artifactsSuffix = "/artifacts";
    const wantsArtifacts = rawId.endsWith(artifactsSuffix);
    const id = decodeURIComponent(wantsArtifacts ? rawId.slice(0, -artifactsSuffix.length) : rawId);
    if (!id) {
      throw new Error("source item id is required");
    }

    if (wantsArtifacts) {
      sendJson(response, await app.buildYazdSourceArtifacts(id), { headers: originHeaders });
      return true;
    }

    sendJson(response, await app.fetchYazdSourceItem(id), { headers: originHeaders });
    return true;
  }

  return false;
}
