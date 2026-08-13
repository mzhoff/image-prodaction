import { OpenRouterRequestError } from '@prodactionpro/chat-connectors';

export async function runWithProviderRetry<T>(input: {
  maxAttempts: number;
  operation: () => Promise<T>;
  retryBaseDelayMs: number;
  signal?: AbortSignal;
  sleep?: (delayMs: number) => Promise<void>;
}): Promise<T> {
  const sleep = input.sleep ?? defaultSleep;
  let attempt = 1;

  while (true) {
    throwIfCancelled(input.signal);
    try {
      return await input.operation();
    } catch (error) {
      if (!isRetryableProviderError(error) || attempt >= input.maxAttempts) throw error;
      const delayMs = input.retryBaseDelayMs * (2 ** (attempt - 1));
      attempt += 1;
      await sleep(delayMs);
      throwIfCancelled(input.signal);
    }
  }
}

function isRetryableProviderError(error: unknown) {
  return error instanceof OpenRouterRequestError && error.retryable;
}

function throwIfCancelled(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new OpenRouterRequestError('AI request was cancelled', 'REQUEST_CANCELLED', false);
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
