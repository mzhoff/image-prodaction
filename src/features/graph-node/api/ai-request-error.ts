export class AiRequestError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(status: number, error: unknown) {
    super(formatApiError(error));
    this.name = 'AiRequestError';
    this.status = status;
    this.code = readApiErrorCode(error);
  }
}

export function formatApiError(error: unknown) {
  if (typeof error === 'string') return error;
  if (!error) return 'OpenRouter request failed';
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return JSON.stringify(error).slice(0, 500);
}

function readApiErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
