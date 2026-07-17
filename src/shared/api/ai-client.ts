import {
  getActiveAssetScope,
  mapRemoteImageAsset,
  type RemoteImageAssetDto,
} from '@/entities/production-graph/lib/remote-asset';
import { notifyProviderUsageUpdated } from './provider-usage-events';

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

export interface AnalyzeImageRequest {
  imageDataUrl: string;
  model: string;
  prompt: string;
}

export interface GenerateImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  inputs: Record<string, string[]>;
  model: string;
  prompt: string;
  referenceImages: Array<{
    dataUrl: string;
    slots: string[];
    sourceAssetId?: string;
    sourceNodeTypes?: string[];
  }>;
  size: string;
  locationInputs?: string[];
  subjectInputs?: string[];
  workspaceId: string;
}

export interface EditImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
  size: string;
  workspaceId: string;
}

export interface RefineImageRequest {
  aspectRatio: string;
  documentId: string;
  idempotencyKey: string;
  imageDataUrl: string;
  instruction: string;
  mode: string;
  model: string;
  preserveStrength: string;
  size: string;
  workspaceId: string;
}

export interface GenerateTextRequest {
  inputText: string;
  instruction: string;
  model: string;
  outputStyle: string;
  reasoning?: 'low' | 'medium' | 'high';
  temperature?: number;
}

export interface GenerateSpeechRequest {
  inputText: string;
  language: 'auto' | 'ru' | 'en' | 'de' | 'es' | 'zh';
  model: string;
  responseFormat: 'mp3' | 'pcm';
  seed?: number;
  speed?: number;
  temperature?: number;
  topP?: number;
  voice: string;
}

export interface FormatTelegramTextRequest {
  inputText: string;
  model: string;
  rulesText?: string;
}

export interface SubjectDescriptionDraft {
  identitySummary?: string;
  immutableTraits?: string;
  mutableAttributes?: string;
  name?: string;
  negativeConstraints?: string;
  notes?: string;
  subjectType?: string;
}

export interface LocationDescriptionDraft {
  atmosphere?: string;
  description?: string;
  locationType?: string;
  mutableAttributes?: string;
  name?: string;
  negativeConstraints?: string;
  notes?: string;
  spatialLayout?: string;
}

export interface DescribeSubjectRequest {
  imageDataUrls: string[];
  model: string;
  subjectType: string;
  textNotes?: string[];
}

export interface DescribeLocationRequest {
  imageDataUrls: string[];
  locationType: string;
  model: string;
  textNotes?: string[];
}

export interface RemoveBackgroundRequest {
  imageDataUrl: string;
}

export interface GenerationRequestOptions {
  onJobAccepted?: (jobId: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function requestAnalyzeImage(payload: AnalyzeImageRequest) {
  const response = await fetchShortAi('/api/ai/analyze-image', withActiveAiScope(payload));
  const result = await response.json() as { text?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  return result.text ?? '';
}

export async function requestGenerateImage(
  payload: GenerateImageRequest,
  options: GenerationRequestOptions = {},
) {
  const abortContext = createGenerationAbortContext(
    options.signal,
    options.timeoutMs ?? 5 * 60 * 1_000,
  );
  try {
    const response = await fetch('/api/ai/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortContext.signal,
    });
    const result = await readGenerationResult(response);
    if (!response.ok) throw new AiRequestError(response.status, result.error);
    let completed;
    if (response.status !== 202) {
      completed = mapCompletedGeneration(result);
    } else {
      const jobId = result.job?.id;
      if (!jobId) {
        throw new AiRequestError(502, {
          code: 'invalid_generation_response',
          message: 'Сервер не вернул идентификатор задачи генерации.',
        });
      }
      options.onJobAccepted?.(jobId);
      const statusUrl = resolveGenerationStatusUrl(result.statusUrl, jobId);
      completed = await pollGenerationJob(statusUrl, abortContext.signal);
    }
    notifyProviderUsageUpdated(payload.workspaceId);
    return completed;
  } catch (error) {
    if (abortContext.didTimeout()) {
      throw new AiRequestError(504, {
        code: 'generation_timeout',
        message: 'Генерация не завершилась за пять минут.',
      });
    }
    throw error;
  } finally {
    abortContext.dispose();
  }
}

export async function requestGenerationJob(
  jobId: string,
  options: Omit<GenerationRequestOptions, 'onJobAccepted'> = {},
) {
  const abortContext = createGenerationAbortContext(
    options.signal,
    options.timeoutMs ?? 5 * 60 * 1_000,
  );
  try {
    return await pollGenerationJob(
      resolveGenerationStatusUrl(undefined, jobId),
      abortContext.signal,
      false,
    );
  } catch (error) {
    if (abortContext.didTimeout()) {
      throw new AiRequestError(504, {
        code: 'generation_timeout',
        message: 'Генерация не завершилась за пять минут.',
      });
    }
    throw error;
  } finally {
    abortContext.dispose();
  }
}

export async function requestEditImage(payload: EditImageRequest) {
  const response = await fetch('/api/ai/edit-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as {
    imageDataUrl?: string | null;
    job?: { id?: string };
    message?: string;
    error?: unknown;
  };
  if (!response.ok) throw new AiRequestError(response.status, result.error);
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  notifyProviderUsageUpdated(payload.workspaceId);
  return { imageDataUrl: result.imageDataUrl, jobId: result.job?.id, message: result.message };
}

export async function requestRefineImage(payload: RefineImageRequest) {
  const response = await fetch('/api/ai/refine-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as {
    imageDataUrl?: string | null;
    job?: { id?: string };
    message?: string;
    error?: unknown;
  };
  if (!response.ok) throw new AiRequestError(response.status, result.error);
  if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');
  notifyProviderUsageUpdated(payload.workspaceId);
  return { imageDataUrl: result.imageDataUrl, jobId: result.job?.id, message: result.message };
}

export async function requestGenerateText(payload: GenerateTextRequest) {
  const response = await fetchShortAi('/api/ai/generate-text', withActiveAiScope(payload));
  const result = await response.json() as { text?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.text) throw new Error(result.message || 'OpenRouter не вернул текст.');
  return { message: result.message, text: result.text };
}

export async function requestGenerateSpeech(payload: GenerateSpeechRequest) {
  const response = await fetchShortAi('/api/ai/generate-speech', withActiveAiScope(payload));
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: unknown; message?: string };
    throw new Error(formatApiError(result.error ?? result.message ?? 'OpenRouter не вернул аудио.'));
  }

  const blob = await response.blob();
  if (blob.size === 0) throw new Error('OpenRouter вернул пустой аудиофайл.');
  return {
    blob,
    generationId: response.headers.get('x-generation-id') ?? undefined,
    mimeType: (response.headers.get('content-type') ?? blob.type) || 'audio/mpeg',
  };
}

export async function requestFormatTelegramText(payload: FormatTelegramTextRequest) {
  const response = await fetchShortAi('/api/ai/format-telegram-text', withActiveAiScope(payload));
  const result = await response.json() as {
    message?: string;
    plainText?: string | null;
    richText?: string | null;
    error?: unknown;
  };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.plainText || !result.richText) throw new Error(result.message || 'OpenRouter не вернул форматирование Telegram-текста.');
  return { message: result.message, plainText: result.plainText, richText: result.richText };
}

export async function requestDescribeSubject(payload: DescribeSubjectRequest) {
  const response = await fetchShortAi('/api/ai/describe-subject', withActiveAiScope(payload));
  const result = await response.json() as { draft?: SubjectDescriptionDraft; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.draft) throw new Error(result.message || 'OpenRouter не вернул описание субъекта.');
  return { draft: result.draft, message: result.message };
}

export async function requestDescribeLocation(payload: DescribeLocationRequest) {
  const response = await fetchShortAi('/api/ai/describe-location', withActiveAiScope(payload));
  const result = await response.json() as { draft?: LocationDescriptionDraft; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.draft) throw new Error(result.message || 'OpenRouter не вернул описание локации.');
  return { draft: result.draft, message: result.message };
}

export async function requestRemoveBackground(payload: RemoveBackgroundRequest) {
  const response = await fetch('/api/ai/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
  if (!response.ok) throw new Error(formatApiError(result.error));
  if (!result.imageDataUrl) throw new Error(result.message || 'FAL не вернул изображение с прозрачностью.');
  return { imageDataUrl: result.imageDataUrl, message: result.message };
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

interface GenerationResultPayload {
  asset?: RemoteImageAssetDto;
  error?: unknown;
  job?: {
    error?: {
      code?: string;
      message?: string;
    } | null;
    id?: string;
    status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  };
  message?: string;
  statusUrl?: string;
}

function withActiveAiScope<T extends object>(payload: T) {
  const scope = getActiveAssetScope();
  if (!scope) {
    throw new Error('Откройте документ в рабочем пространстве перед запуском AI-операции.');
  }
  return {
    ...payload,
    ...scope,
    idempotencyKey: crypto.randomUUID(),
  };
}

async function fetchShortAi(path: string, payload: object) {
  const body = JSON.stringify(payload);
  const execute = () => fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  try {
    const response = await execute();
    notifyUsageFromScopedPayload(response, payload);
    return response;
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const response = await execute();
    notifyUsageFromScopedPayload(response, payload);
    return response;
  }
}

function notifyUsageFromScopedPayload(response: Response, payload: object) {
  if (!response.ok || !('workspaceId' in payload)) return;
  const workspaceId = payload.workspaceId;
  if (typeof workspaceId === 'string') notifyProviderUsageUpdated(workspaceId);
}

async function readGenerationResult(response: Response) {
  return response.json().catch(() => ({})) as Promise<GenerationResultPayload>;
}

function mapCompletedGeneration(result: GenerationResultPayload) {
  if (!result.asset) {
    throw new Error(result.message || 'OpenRouter не вернул изображение.');
  }
  return {
    asset: mapRemoteImageAsset(result.asset),
    jobId: result.job?.id,
    message: result.message,
  };
}

function resolveGenerationStatusUrl(statusUrl: string | undefined, jobId: string) {
  if (statusUrl?.startsWith('/api/generation-jobs/')) return statusUrl;
  return `/api/generation-jobs/${encodeURIComponent(jobId)}`;
}

async function pollGenerationJob(
  statusUrl: string,
  signal: AbortSignal,
  waitBeforeFirstRequest = true,
) {
  let waitBeforeRequest = waitBeforeFirstRequest;
  while (true) {
    if (waitBeforeRequest) await waitForGenerationPoll(1_000, signal);
    waitBeforeRequest = true;
    const statusResponse = await fetch(statusUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    const statusResult = await readGenerationResult(statusResponse);
    if (!statusResponse.ok) {
      throw new AiRequestError(statusResponse.status, statusResult.error);
    }
    if (statusResult.job?.status === 'failed' || statusResult.job?.status === 'canceled') {
      throw new AiRequestError(
        409,
        statusResult.job.error ?? {
          code: `generation_${statusResult.job.status}`,
          message: statusResult.message ?? 'Задача генерации не была завершена.',
        },
      );
    }
    if (statusResult.job?.status === 'succeeded' || statusResult.asset) {
      return mapCompletedGeneration(statusResult);
    }
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
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
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
  return Number.isFinite(value) && value >= 1_000
    ? Math.min(value, 30 * 60 * 1_000)
    : 5 * 60 * 1_000;
}

function waitForGenerationPoll(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
