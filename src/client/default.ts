import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { parseCacheContents } from "../cache.ts";
import type { AppConfig, CacheData } from "../types.ts";
import {
  createDefaultGranolaAuthController,
  inspectDefaultGranolaAuth,
  type DefaultGranolaAuthController,
  type DefaultGranolaAuthInfo,
} from "./default-auth.ts";
import {
  createDefaultGranolaSyncAdapterRegistry,
  type DefaultGranolaClient,
  type DefaultGranolaRuntime,
  type GranolaSyncAdapterRegistry,
} from "./sync-adapter-registry.ts";

export async function createDefaultGranolaRuntime(
  config: AppConfig,
  logger: Pick<Console, "warn"> = console,
  options: {
    adapter?: "granola";
    adapterRegistry?: GranolaSyncAdapterRegistry;
    preferredMode?: DefaultGranolaAuthInfo["mode"];
  } = {},
): Promise<DefaultGranolaRuntime> {
  const adapterRegistry =
    options.adapterRegistry ?? createDefaultGranolaSyncAdapterRegistry(config, logger);
  const adapter = adapterRegistry.resolve(options.adapter ?? "granola", "sync adapter");
  return await adapter.createRuntime({
    preferredMode: options.preferredMode,
  });
}

export function createDefaultGranolaAuth(config: AppConfig): DefaultGranolaAuthController {
  return createDefaultGranolaAuthController(config);
}

export async function createDefaultGranolaApiClient(
  config: AppConfig,
  logger: Pick<Console, "warn"> = console,
): Promise<DefaultGranolaClient> {
  return (await createDefaultGranolaRuntime(config, logger)).client;
}

export async function loadOptionalGranolaCache(cacheFile?: string): Promise<CacheData | undefined> {
  if (!cacheFile || !existsSync(cacheFile)) {
    return undefined;
  }

  return parseCacheContents(await readFile(cacheFile, "utf8"));
}

export {
  createDefaultGranolaAuthController,
  createDefaultGranolaSyncAdapterRegistry,
  inspectDefaultGranolaAuth,
  type DefaultGranolaClient,
  type DefaultGranolaAuthController,
  type DefaultGranolaAuthInfo,
  type DefaultGranolaRuntime,
  type GranolaSyncAdapterRegistry,
};
