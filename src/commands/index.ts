import { notesCommand } from "./notes.ts";
import { transcriptsCommand } from "./transcripts.ts";

export const commands = [notesCommand, transcriptsCommand];

export const commandMap = new Map(commands.map((command) => [command.name, command]));
