export class GranolaClientHttpError extends Error {
  readonly body?: string;
  readonly status: number;
  readonly statusText: string;

  constructor(
    message: string,
    options: {
      body?: string;
      status: number;
      statusText: string;
    },
  ) {
    super(message);
    this.name = "GranolaClientHttpError";
    this.body = options.body;
    this.status = options.status;
    this.statusText = options.statusText;
  }
}

export function granolaClientHttpError(
  action: string,
  status: number,
  statusText: string,
  body?: string,
): GranolaClientHttpError {
  return new GranolaClientHttpError(
    `${action}: ${status} ${statusText}${body ? `: ${body}` : ""}`,
    {
      body,
      status,
      statusText,
    },
  );
}

export function isGranolaRateLimitError(error: unknown): boolean {
  if (error instanceof GranolaClientHttpError) {
    return error.status === 429;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /\b429\b/.test(error.message) || /RATE_LIMITED/.test(error.message);
}
