import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test, vi } from "vite-plus/test";

import { createGranEventHookRunner } from "../src/event-hooks.ts";

describe("createGranEventHookRunner", () => {
  test("runs script hooks with event payload on stdin", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gran-hooks-"));
    const outputPath = join(directory, "hook-output.json");
    const scriptPath = join(directory, "capture.mjs");

    await writeFile(
      scriptPath,
      [
        'import { writeFileSync } from "node:fs";',
        'let input = "";',
        'process.stdin.setEncoding("utf8");',
        'process.stdin.on("data", (chunk) => { input += chunk; });',
        'process.stdin.on("end", () => {',
        "  writeFileSync(process.argv[2], JSON.stringify({",
        "    env: {",
        "      id: process.env.GRAN_EVENT_ID,",
        "      kind: process.env.GRAN_EVENT_KIND,",
        "      meetingId: process.env.GRAN_EVENT_MEETING_ID,",
        "    },",
        "    payload: JSON.parse(input),",
        "  }));",
        "});",
      ].join("\n"),
      "utf8",
    );

    const runner = createGranEventHookRunner({
      hooks: [
        {
          args: [scriptPath, outputPath],
          events: ["transcript.ready"],
          id: "capture",
          kind: "script",
          run: process.execPath,
        },
      ],
    });

    await runner!.runEvents([
      {
        folders: [],
        id: "sync-1:1",
        kind: "transcript.ready",
        meetingId: "doc-alpha-1111",
        occurredAt: "2024-03-01T12:00:00.000Z",
        runId: "sync-1",
        tags: ["team"],
        title: "Alpha Sync",
        transcriptLoaded: true,
        updatedAt: "2024-03-01T12:00:00.000Z",
      },
    ]);

    const written = JSON.parse(await readFile(outputPath, "utf8"));
    expect(written).toEqual({
      env: {
        id: "sync-1:1",
        kind: "transcript.ready",
        meetingId: "doc-alpha-1111",
      },
      payload: {
        event: {
          folders: [],
          id: "sync-1:1",
          kind: "transcript.ready",
          meetingId: "doc-alpha-1111",
          occurredAt: "2024-03-01T12:00:00.000Z",
          runId: "sync-1",
          tags: ["team"],
          title: "Alpha Sync",
          transcriptLoaded: true,
          updatedAt: "2024-03-01T12:00:00.000Z",
        },
        source: {
          product: "gran",
        },
      },
    });
  });

  test("posts webhook hooks as json", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "",
    }));

    const runner = createGranEventHookRunner({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hooks: [
        {
          events: ["meeting.created"],
          headers: {
            authorization: "Bearer token",
          },
          id: "notify",
          kind: "webhook",
          url: "http://127.0.0.1:4124/hooks/gran",
        },
      ],
    });

    await runner!.runEvents([
      {
        folders: [],
        id: "sync-2:1",
        kind: "meeting.created",
        meetingId: "doc-beta-2222",
        occurredAt: "2024-03-02T12:00:00.000Z",
        runId: "sync-2",
        tags: [],
        title: "Beta Sync",
        transcriptLoaded: false,
        updatedAt: "2024-03-02T12:00:00.000Z",
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:4124/hooks/gran", {
      body: JSON.stringify({
        event: {
          folders: [],
          id: "sync-2:1",
          kind: "meeting.created",
          meetingId: "doc-beta-2222",
          occurredAt: "2024-03-02T12:00:00.000Z",
          runId: "sync-2",
          tags: [],
          title: "Beta Sync",
          transcriptLoaded: false,
          updatedAt: "2024-03-02T12:00:00.000Z",
        },
        source: {
          product: "gran",
        },
      }),
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      method: "POST",
    });
  });

  test("warns and continues when a hook fails", async () => {
    const warn = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => "boom",
    }));

    const runner = createGranEventHookRunner({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hooks: [
        {
          id: "notify",
          kind: "webhook",
          url: "http://127.0.0.1:4124/hooks/gran",
        },
      ],
      logger: { warn },
    });

    await expect(
      runner!.runEvents([
        {
          folders: [],
          id: "sync-3:1",
          kind: "meeting.changed",
          meetingId: "doc-gamma-3333",
          occurredAt: "2024-03-03T12:00:00.000Z",
          runId: "sync-3",
          tags: [],
          title: "Gamma Sync",
          transcriptLoaded: false,
          updatedAt: "2024-03-03T12:00:00.000Z",
        },
      ]),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      "event hook notify failed for meeting.changed (doc-gamma-3333): boom",
    );
  });
});
