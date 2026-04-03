import { authCommand } from "./auth.ts";
import { notesCommand } from "./notes.ts";
import { transcriptsCommand } from "./transcripts.ts";

export const commands = [authCommand, notesCommand, transcriptsCommand];

export const commandMap = new Map(commands.map((command) => [command.name, command]));
