const RESET = "\x1b[0m";

function colour(code: string, text: string): string {
  return `\x1b[${code}m${text}${RESET}`;
}

export const granolaTuiTheme = {
  accent(text: string): string {
    return colour("36", text);
  },
  dim(text: string): string {
    return colour("2", text);
  },
  error(text: string): string {
    return colour("31", text);
  },
  info(text: string): string {
    return colour("32", text);
  },
  selected(text: string): string {
    return colour("7", text);
  },
  strong(text: string): string {
    return colour("1", text);
  },
  warning(text: string): string {
    return colour("33", text);
  },
};
