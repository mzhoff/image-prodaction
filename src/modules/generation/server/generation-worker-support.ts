import { GenerationExecutionError } from './generation-worker-contracts';

export function normalizeExecutionFailure(error: unknown) {
  if (error instanceof GenerationExecutionError) {
    return {
      code: normalizeErrorCode(error.code),
      message: normalizeErrorMessage(error.message),
      retryable: error.retryable,
      usage: error.usage,
    };
  }
  return {
    code: 'worker_execution_error',
    message: normalizeErrorMessage(error instanceof Error ? error.message : 'Generation execution failed.'),
    retryable: true,
    usage: undefined,
  };
}

export function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

export function waitFor(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(createAbortError());
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      reject(createAbortError());
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function normalizeErrorCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 120) || 'worker_execution_error';
}

function normalizeErrorMessage(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 1_000) || 'Generation execution failed.';
}

function createAbortError() {
  const error = new Error('Operation aborted.');
  error.name = 'AbortError';
  return error;
}
