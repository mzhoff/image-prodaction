import { mapRemoteImageAsset, type RemoteImageAssetDto } from '@/entities/production-graph/lib/remote-asset';
import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';
import type { GenerateImageRequest, GenerationRequestOptions } from './ai-client-contracts';
import { AiRequestError } from './ai-request-error';

interface GenerationResultPayload {
  asset?: RemoteImageAssetDto;
  error?: unknown;
  job?: {
    error?: { code?: string; message?: string } | null;
    id?: string;
    status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  };
  message?: string;
  statusUrl?: string;
}

export async function requestGenerateImage(
  payload: GenerateImageRequest,
  options: GenerationRequestOptions = {},
) {
  const abortContext = createGenerationAbortContext(options.signal, options.timeoutMs ?? 5 * 60 * 1_000);
  try {
    const response = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortContext.signal,
    });
    const result = await readGenerationResult(response);
    if (!response.ok) throw new AiRequestError(response.status, result.error);
    const completed = response.status === 202
      ? await waitForAcceptedGeneration(result, options, abortContext.signal)
      : mapCompletedGeneration(result);
    notifyProviderUsageUpdated(payload.workspaceId);
    return completed;
  } catch (error) {
    throwTimedOutGeneration(abortContext.didTimeout());
    throw error;
  } finally {
    abortContext.dispose();
  }
}

export async function requestGenerationJob(
  jobId: string,
  options: Omit<GenerationRequestOptions, 'onJobAccepted'> = {},
) {
  const abortContext = createGenerationAbortContext(options.signal, options.timeoutMs ?? 5 * 60 * 1_000);
  try {
    return await pollGenerationJob(resolveGenerationStatusUrl(undefined, jobId), abortContext.signal, false);
  } catch (error) {
    throwTimedOutGeneration(abortContext.didTimeout());
    throw error;
  } finally {
    abortContext.dispose();
  }
}

async function waitForAcceptedGeneration(
  result: GenerationResultPayload,
  options: GenerationRequestOptions,
  signal: AbortSignal,
) {
  const jobId = result.job?.id;
  if (!jobId) {
    throw new AiRequestError(502, {
      code: 'invalid_generation_response',
      message: 'Сервер не вернул идентификатор задачи генерации.',
    });
  }
  options.onJobAccepted?.(jobId);
  return pollGenerationJob(resolveGenerationStatusUrl(result.statusUrl, jobId), signal);
}

async function readGenerationResult(response: Response) {
  return response.json().catch(() => ({})) as Promise<GenerationResultPayload>;
}

function mapCompletedGeneration(result: GenerationResultPayload) {
  if (!result.asset) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  return { asset: mapRemoteImageAsset(result.asset), jobId: result.job?.id, message: result.message };
}

function resolveGenerationStatusUrl(statusUrl: string | undefined, jobId: string) {
  return statusUrl?.startsWith('/api/generation-jobs/')
    ? statusUrl
    : `/api/generation-jobs/${encodeURIComponent(jobId)}`;
}

async function pollGenerationJob(statusUrl: string, signal: AbortSignal, waitBeforeFirstRequest = true) {
  let waitBeforeRequest = waitBeforeFirstRequest;
  while (true) {
    if (waitBeforeRequest) await waitForGenerationPoll(1_000, signal);
    waitBeforeRequest = true;
    const response = await fetch(statusUrl, { cache: 'no-store', credentials: 'same-origin', signal });
    const result = await readGenerationResult(response);
    if (!response.ok) throw new AiRequestError(response.status, result.error);
    if (result.job?.status === 'failed' || result.job?.status === 'canceled') {
      throw new AiRequestError(409, result.job.error ?? {
        code: `generation_${result.job.status}`,
        message: result.message ?? 'Задача генерации не была завершена.',
      });
    }
    if (result.job?.status === 'succeeded' || result.asset) return mapCompletedGeneration(result);
  }
}

function createGenerationAbortContext(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, normalizeGenerationTimeout(timeoutMs));
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) controller.abort(signal.reason);
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function normalizeGenerationTimeout(value: number) {
  return Number.isFinite(value) && value >= 1_000 ? Math.min(value, 30 * 60 * 1_000) : 5 * 60 * 1_000;
}

function throwTimedOutGeneration(didTimeout: boolean) {
  if (!didTimeout) return;
  throw new AiRequestError(504, {
    code: 'generation_timeout',
    message: 'Генерация не завершилась за пять минут.',
  });
}

function waitForGenerationPoll(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
