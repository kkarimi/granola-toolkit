import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BrowserOpenCommand {
  args: string[];
  file: string;
}

export interface OpenExternalUrlOptions {
  platform?: NodeJS.Platform;
  run?: (file: string, args: string[]) => Promise<void>;
}

export function getBrowserOpenCommand(
  url: string | URL,
  platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand {
  const href = String(url);

  switch (platform) {
    case "darwin":
      return {
        args: [href],
        file: "open",
      };
    case "win32":
      return {
        args: ["/c", "start", "", href],
        file: "cmd",
      };
    default:
      return {
        args: [href],
        file: "xdg-open",
      };
  }
}

export async function openExternalUrl(
  url: string | URL,
  options: OpenExternalUrlOptions = {},
): Promise<void> {
  const command = getBrowserOpenCommand(url, options.platform);
  const run =
    options.run ??
    (async (file: string, args: string[]) => {
      await execFileAsync(file, args);
    });

  await run(command.file, command.args);
}
