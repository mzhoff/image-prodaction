export interface PipelineRetryPolicy {
  nextDelayMs(attemptCount: number): number;
}

export interface PipelineRetryPolicyOptions {
  baseDelayMs?: number;
  jitterRatio?: number;
  maxDelayMs?: number;
  random?: () => number;
}

export function createPipelineRetryPolicy(
  options: PipelineRetryPolicyOptions = {},
): PipelineRetryPolicy {
  const baseDelayMs = normalizePositiveInteger(options.baseDelayMs ?? 1_000, 'Base delay');
  const maxDelayMs = normalizePositiveInteger(options.maxDelayMs ?? 60_000, 'Maximum delay');
  const jitterRatio = options.jitterRatio ?? 0.2;
  const random = options.random ?? Math.random;

  if (baseDelayMs > maxDelayMs) {
    throw new Error('Base delay cannot exceed maximum delay.');
  }
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
    throw new Error('Jitter ratio must be between 0 and 1.');
  }

  return {
    nextDelayMs(attemptCount) {
      if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
        throw new Error('Attempt count must be a positive safe integer.');
      }
      const exponential = Math.min(
        maxDelayMs,
        baseDelayMs * (2 ** Math.max(0, attemptCount - 1)),
      );
      const jitter = exponential * jitterRatio * ((random() * 2) - 1);
      return Math.max(0, Math.round(exponential + jitter));
    },
  };
}

function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}
