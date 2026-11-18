/**
 * Base error for anything that goes wrong inside an Edge Function's own
 * logic (bad config, unexpected shape, etc). Distinct from `FetchError` so
 * callers can tell "we misconfigured something" apart from "the network/
 * upstream API failed".
 */
export class AppError extends Error {
  constructor(
    public readonly context: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(AppError.formatMessage(context, message, details));
    this.name = 'AppError';
  }

  private static formatMessage(
    context: string,
    message: string,
    details?: Record<string, unknown>,
  ): string {
    const parts = [`[${context}]`, message];
    if (details && Object.keys(details).length > 0) {
      const detailStr = Object.entries(details)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      parts.push(`|| ${detailStr}`);
    }
    return parts.join(' ');
  }
}

/** Raised when an outbound `fetch` (Gemini, YouTube, ...) fails or times out. */
export class FetchError extends AppError {
  constructor(context: string, message: string, details?: Record<string, unknown>) {
    super(context, message, details);
    this.name = 'FetchError';
  }
}
