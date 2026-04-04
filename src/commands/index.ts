import { authCommand } from "./auth.ts";
import { exportsCommand } from "./exports.ts";
import { meetingCommand } from "./meeting.ts";
import { notesCommand } from "./notes.ts";
import { serveCommand } from "./serve.ts";
import { transcriptsCommand } from "./transcripts.ts";
import { webCommand } from "./web.ts";

export const commands = [
  authCommand,
  exportsCommand,
  meetingCommand,
  notesCommand,
  serveCommand,
  transcriptsCommand,
  webCommand,
];

export const commandMap = new Map(commands.map((command) => [command.name, command]));
