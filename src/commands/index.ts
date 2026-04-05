import { attachCommand } from "./attach.ts";
import { automationCommand } from "./automation.ts";
import { authCommand } from "./auth.ts";
import { exportsCommand } from "./exports.ts";
import { folderCommand } from "./folder.ts";
import { initCommand } from "./init.ts";
import { meetingCommand } from "./meeting.ts";
import { notesCommand } from "./notes.ts";
import { searchCommand } from "./search.ts";
import { serviceCommand } from "./service.ts";
import { serveCommand } from "./serve.ts";
import { syncCommand } from "./sync.ts";
import { tuiCommand } from "./tui.ts";
import { transcriptsCommand } from "./transcripts.ts";
import { webCommand } from "./web.ts";

export const commands = [
  attachCommand,
  automationCommand,
  authCommand,
  exportsCommand,
  folderCommand,
  initCommand,
  meetingCommand,
  notesCommand,
  searchCommand,
  serviceCommand,
  serveCommand,
  syncCommand,
  tuiCommand,
  transcriptsCommand,
  webCommand,
];

export const commandMap = new Map(commands.map((command) => [command.name, command]));
