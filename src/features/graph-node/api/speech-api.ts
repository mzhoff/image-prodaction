import { mapRemoteAudioAsset, remoteAudioAssetSchema } from '@/entities/production-graph/lib/remote-audio-asset';
import type { ActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';
import type { GenerateSpeechRequest } from './ai-client-contracts';
import { formatApiError } from './ai-request-error';

export interface SpeechProgress { completedParts: number; totalParts: number; phase: string }
export interface SpeechRequestOptions {
  scope: ActiveAssetScope; idempotencyKey: string; signal?: AbortSignal;
  onJobAccepted?: (jobId: string) => void; onProgress?: (progress: SpeechProgress) => void;
}
export type SpeechApiResult = { asset: AssetRecord; sizeBytes: number; generationId?: string } | { blob: Blob; mimeType: string; generationId?: string };

export async function requestCancelSpeechJob(jobId: string) {
  const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST', credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(formatApiError((await response.json().catch(() => ({}))).error));
}

export async function isSpeechJobTerminal(jobId: string) {
  const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`, { credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatApiError(result.error));
  return ['succeeded', 'canceled'].includes(result.job?.status)
    || result.job?.status === 'failed' && !result.job.error?.retryable;
}

export async function requestSpeech(payload: GenerateSpeechRequest, options: SpeechRequestOptions): Promise<SpeechApiResult> {
  const response = await fetch('/api/ai/generate-speech', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, signal: options.signal,
    body: JSON.stringify({ ...payload, ...options.scope, idempotencyKey: options.idempotencyKey }) });
  if (!response.ok) throw new Error(formatApiError((await response.json().catch(() => ({}))).error));
  if ((response.headers.get('content-type') ?? '').includes('application/json')) {
    const result = await response.json();
    const completed = readSpeechJobResult(result, options);
    if (completed) return completed;
    if (typeof result.job?.id !== 'string') throw new Error('The server did not return a Voice job ID.');
    return requestSpeechJob(result.job.id, options);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The provider returned an empty audio file.');
  notifyProviderUsageUpdated(options.scope.workspaceId);
  return { blob, mimeType: response.headers.get('content-type') || blob.type || 'audio/mpeg',
    generationId: response.headers.get('x-generation-id') ?? undefined };
}

export async function requestSpeechJob(jobId: string, options: SpeechRequestOptions): Promise<SpeechApiResult> {
  const deadline = Date.now() + 60 * 60 * 1000;
  while (Date.now() < deadline) {
    options.signal?.throwIfAborted();
    const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`, {
      credentials: 'same-origin', cache: 'no-store', signal: options.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(formatApiError(result.error));
    const completed = readSpeechJobResult(result, options);
    if (completed) return completed;
    await waitForPoll(options.signal);
  }
  throw new Error('Voice is still processing. Reopen the project to resume status updates; do not start a duplicate generation.');
}

function readSpeechJobResult(result: {
  job?: { id?: string; status?: string; error?: { code?: string; message?: string; retryable?: boolean } | null };
  asset?: unknown; progress?: SpeechProgress | null;
}, options: SpeechRequestOptions): SpeechApiResult | null {
  if (result.job?.id) options.onJobAccepted?.(result.job.id);
  if (result.progress) options.onProgress?.(result.progress);
  if (result.job?.status === 'failed' && !result.job.error?.retryable || result.job?.status === 'canceled') {
    throw new Error(result.job.error?.message || `Voice ${result.job.status}. Completed parts were preserved; review the job before starting again.`);
  }
  if (result.asset) {
    notifyProviderUsageUpdated(options.scope.workspaceId);
    const asset = remoteAudioAssetSchema.parse(result.asset);
    return { asset: mapRemoteAudioAsset(asset), sizeBytes: asset.byteSize ?? 0 };
  }
  if (result.job?.status === 'succeeded') throw new Error('Voice completed without a valid audio asset.');
  return null;
}

function waitForPoll(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 1500);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
