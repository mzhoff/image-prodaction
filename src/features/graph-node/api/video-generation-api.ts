import { mapRemoteVideoAsset, remoteVideoAssetSchema } from '@/entities/production-graph/lib/remote-video-asset';
import { formatApiError } from './ai-request-error';
import type { GenerateVideoNodeData } from '@/entities/production-graph/model/types';

export interface VideoJobResponse { job: { id: string; status: string; attemptCount?: number; maxAttempts?: number; error?: { message?: string; retryable?: boolean } | null }; asset?: unknown }
export function isVideoJobTerminal(result: VideoJobResponse) {
  return result.job.status === 'succeeded' || result.job.status === 'canceled'
    || result.job.status === 'failed' && (!result.job.error?.retryable || (result.job.attemptCount ?? 0) >= (result.job.maxAttempts ?? 3));
}
export async function readVideoJob(jobId: string, signal?: AbortSignal): Promise<VideoJobResponse> {
  return json(`/api/generation-jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store', signal });
}
export async function submitVideo(saved: NonNullable<GenerateVideoNodeData['videoRequest']>, signal: AbortSignal): Promise<VideoJobResponse> {
  return json('/api/ai/generate-video', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request: saved.payload, workspaceId: saved.workspaceId, documentId: saved.documentId, idempotencyKey: saved.idempotencyKey }) });
}
export function videoJobAsset(result: VideoJobResponse) { return mapRemoteVideoAsset(remoteVideoAssetSchema.parse(result.asset)); }
async function json(url: string, options: RequestInit) {
  const response = await fetch(url, { ...options, credentials: 'same-origin' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatApiError(body.error));
  if (!body.job?.id || !body.job?.status) throw new Error('Сервер не вернул задание видео.');
  return body as VideoJobResponse;
}
export function waitVideoPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  });
}
