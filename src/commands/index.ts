import { authCommand } from "./auth.ts";
import { meetingCommand } from "./meeting.ts";
import { notesCommand } from "./notes.ts";
import { transcriptsCommand } from "./transcripts.ts";

export const commands = [authCommand, meetingCommand, notesCommand, transcriptsCommand];

export const commandMap = new Map(commands.map((command) => [command.name, command]));
