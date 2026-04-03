export function debug(enabled: boolean, ...values: unknown[]): void {
  if (enabled) {
    console.error("[debug]", ...values);
  }
}
