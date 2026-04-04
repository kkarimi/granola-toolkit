import { attachCommand } from "./attach.ts";
import { authCommand } from "./auth.ts";
import { exportsCommand } from "./exports.ts";
import { meetingCommand } from "./meeting.ts";
import { notesCommand } from "./notes.ts";
import { serveCommand } from "./serve.ts";
import { tuiCommand } from "./tui.ts";
import { transcriptsCommand } from "./transcripts.ts";
import { webCommand } from "./web.ts";

export const commands = [
  attachCommand,
  authCommand,
  exportsCommand,
  meetingCommand,
  notesCommand,
  serveCommand,
  tuiCommand,
  transcriptsCommand,
  webCommand,
];

export const commandMap = new Map(commands.map((command) => [command.name, command]));
