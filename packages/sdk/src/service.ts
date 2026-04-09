import {
  createGranolaServerClient,
  GranolaServerClient,
  type GranolaServerClientOptions,
} from "@kkarimi/gran-core";

export async function connectGranService(
  serverUrl: string | URL,
  options: GranolaServerClientOptions = {},
): Promise<GranolaServerClient> {
  return await createGranolaServerClient(serverUrl, options);
}

export { createGranolaServerClient, GranolaServerClient, type GranolaServerClientOptions };
