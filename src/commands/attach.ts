import { createGranolaServerClient } from "../server/client.ts";
import { discoverGranolaService } from "../service.ts";
import { runGranolaTui } from "../tui/workspace.ts";

import type { CommandDefinition } from "./types.ts";

function attachHelp(): string {
  return `Granola attach

Usage:
  granola attach [url] [options]

Options:
  --meeting <id>      Open the workspace focused on a specific meeting
  --password <value>  Server password for protected local APIs
  -h, --help          Show help
`;
}

export const attachCommand: CommandDefinition = {
  description: "Attach the terminal workspace to an existing Granola server",
  flags: {
    help: { type: "boolean" },
    meeting: { type: "string" },
    password: { type: "string" },
  },
  help: attachHelp,
  name: "attach",
  async run({ commandArgs, commandFlags }) {
    let serverUrl = commandArgs[0];
    if (!serverUrl?.trim()) {
      const discovered = await discoverGranolaService();
      if (!discovered) {
        throw new Error(
          "attach requires a server URL or a running background service. Start one with `granola service start`.",
        );
      }

      serverUrl = discovered.url;
      console.log(`Attaching to ${serverUrl}`);
    }

    const initialMeetingId =
      typeof commandFlags.meeting === "string" && commandFlags.meeting.trim()
        ? commandFlags.meeting.trim()
        : undefined;
    const password =
      typeof commandFlags.password === "string" && commandFlags.password.trim()
        ? commandFlags.password.trim()
        : undefined;
    const app = await createGranolaServerClient(serverUrl, {
      password,
    });

    return await runGranolaTui(app, {
      initialMeetingId,
    });
  },
};
