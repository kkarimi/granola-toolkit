import { spawn } from "node:child_process";

import type { GranolaAppSyncEvent } from "./app/types.ts";
import type { GranEventHook, GranEventScriptHook, GranEventWebhookHook } from "./types.ts";

export interface GranEventHookRunner {
  runEvents(events: GranolaAppSyncEvent[]): Promise<void>;
}

export interface CreateGranEventHookRunnerOptions {
  fetchImpl?: typeof fetch;
  hooks: GranEventHook[];
  logger?: Pick<Console, "warn">;
}

interface GranEventHookPayload {
  event: GranolaAppSyncEvent;
  source: {
    product: "gran";
  };
}

function matchesHookEvent(hook: GranEventHook, event: GranolaAppSyncEvent): boolean {
  return !hook.events?.length || hook.events.includes(event.kind);
}

function buildHookPayload(event: GranolaAppSyncEvent): GranEventHookPayload {
  return {
    event,
    source: {
      product: "gran",
    },
  };
}

async function runScriptHook(
  hook: GranEventScriptHook,
  payload: GranEventHookPayload,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(hook.run, hook.args ?? [], {
      cwd: hook.cwd,
      env: {
        ...process.env,
        ...hook.env,
        GRAN_EVENT_ID: payload.event.id,
        GRAN_EVENT_KIND: payload.event.kind,
        GRAN_EVENT_MEETING_ID: payload.event.meetingId,
        GRAN_EVENT_OCCURRED_AT: payload.event.occurredAt,
        GRAN_EVENT_RUN_ID: payload.event.runId,
        GRAN_EVENT_TITLE: payload.event.title,
        GRAN_HOOK_ID: hook.id,
      },
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";

    child.on("error", reject);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `process exited with status ${code ?? "unknown"}`));
    });
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

async function runWebhookHook(
  hook: GranEventWebhookHook,
  payload: GranEventHookPayload,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(hook.url, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      ...hook.headers,
    },
    method: "POST",
  });

  if (response.ok) {
    return;
  }

  const body = await response.text();
  throw new Error(body || `received status ${response.status}`);
}

export function createGranEventHookRunner(
  options: CreateGranEventHookRunnerOptions,
): GranEventHookRunner | undefined {
  if (options.hooks.length === 0) {
    return undefined;
  }

  const logger = options.logger ?? console;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async runEvents(events) {
      for (const event of events) {
        const payload = buildHookPayload(event);

        for (const hook of options.hooks) {
          if (!matchesHookEvent(hook, event)) {
            continue;
          }

          try {
            if (hook.kind === "script") {
              await runScriptHook(hook, payload);
            } else {
              await runWebhookHook(hook, payload, fetchImpl);
            }
          } catch (error) {
            logger.warn(
              `event hook ${hook.id} failed for ${event.kind} (${event.meetingId}): ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    },
  };
}
