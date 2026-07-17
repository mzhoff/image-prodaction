export interface GenerationRetryPolicy {
  nextDelayMs(attemptCount: number): number;
}

export interface ExponentialBackoffOptions {
  baseDelayMs?: number;
  jitterRatio?: number;
  maxDelayMs?: number;
  random?: () => number;
}

const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_JITTER_RATIO = 0.2;

export function createExponentialBackoffPolicy(
  options: ExponentialBackoffOptions = {},
): GenerationRetryPolicy {
  const baseDelayMs = normalizePositiveInteger(
    options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    'Base retry delay',
  );
  const maxDelayMs = normalizePositiveInteger(
    options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    'Maximum retry delay',
  );
  if (maxDelayMs < baseDelayMs) {
    throw new Error('Maximum retry delay must be greater than or equal to base retry delay.');
  }
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new Error('Retry jitter ratio must be between 0 and 1.');
  }
  const random = options.random ?? Math.random;

  return {
    nextDelayMs(attemptCount) {
      if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
        throw new Error('Attempt count must be a positive safe integer.');
      }
      const exponent = Math.min(attemptCount - 1, 30);
      const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
      if (jitterRatio === 0) return exponentialDelay;

      const randomValue = Math.min(1, Math.max(0, random()));
      const spread = exponentialDelay * jitterRatio;
      return Math.max(0, Math.min(
        maxDelayMs,
        Math.round(exponentialDelay - spread + (2 * spread * randomValue)),
      ));
    },
  };
}

function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}
