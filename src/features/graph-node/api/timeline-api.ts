import { z } from 'zod';
import { AssetClientError, mapRemoteImageAsset } from '@/entities/production-graph/lib/remote-asset';
import { deriveRemoteVideoAsset } from '@/entities/production-graph/lib/remote-video-asset';
import { timelineAnalysisSchema, timelineDescriptionResultSchema, type TimelineAnalysis, type TimelineDescriptionResult, type TimelineShot } from '@/shared/media/timeline-contracts';
import { notifyProviderUsageUpdated } from '@/shared/api/provider-usage-events';
import { timelineAnalysisProgressSchema, type TimelineAnalysisProgress } from '@/shared/media/timeline-progress';
import { formatApiError } from './ai-request-error';

export type TimelinePayload = { action: 'analyze'; assetId: string; threshold: number }
  | { action: 'describe'; assetId: string; sourceChecksum: string; shots: TimelineShot[]; model: string; language: string };
export type TimelineResult = TimelineAnalysis | TimelineDescriptionResult;
export type TimelineJob = { id: string; status: string; startedAt?: string | null; error?: { message?: string; retryable?: boolean } | null };
export type { TimelineAnalysisProgress } from '@/shared/media/timeline-progress';
export type TimelineJobResponse = { job: TimelineJob; result?: TimelineResult;
  progress?: { completedShots?: number; totalShots?: number | null; analysis?: TimelineAnalysisProgress | null } };
const jobResponseSchema = z.object({ job: z.object({ id: z.string(), status: z.string(), startedAt: z.string().nullish(),
  error: z.object({ message: z.string().optional(), retryable: z.boolean().optional() }).nullish() }),
  result: z.union([timelineAnalysisSchema, timelineDescriptionResultSchema]).nullish().transform((value) => value ?? undefined),
  progress: z.object({ completedShots: z.number().optional(), totalShots: z.number().nullable().optional(),
    analysis: timelineAnalysisProgressSchema.nullish() }).optional() });

export async function startTimelineJob(payload: TimelinePayload, scope: { workspaceId: string; documentId: string | null }, idempotencyKey: string, signal?: AbortSignal) {
  return readResponse(await fetch('/api/timeline', { method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...scope, idempotencyKey }) }));
}

export async function readTimelineJob(jobId: string, signal?: AbortSignal): Promise<TimelineJobResponse> {
  return readResponse(await fetch(`/api/timeline/jobs/${encodeURIComponent(jobId)}`, {
    credentials: 'same-origin', cache: 'no-store', signal }));
}

async function readResponse(response: Response): Promise<TimelineJobResponse> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(payload?.error ?? 'Timeline request failed.'));
  return jobResponseSchema.parse(payload);
}

export async function waitForTimelineJob(initial: TimelineJobResponse, options: {
  signal: AbortSignal; workspaceId: string; onUpdate: (response: TimelineJobResponse) => void;
}) {
  let response = initial;
  const deadline = Date.now() + 60 * 60 * 1000;
  while (Date.now() < deadline) {
    options.signal.throwIfAborted();
    options.onUpdate(response);
    if (response.job.status === 'succeeded') {
      if (!response.result) throw new Error('Timeline completed without a result. Check the same request again.');
      notifyProviderUsageUpdated(options.workspaceId);
      return response.result;
    }
    if (response.job.status === 'canceled' || response.job.status === 'failed' && !response.job.error?.retryable) {
      throw new Error(response.job.error?.message || 'Timeline processing was canceled. Completed descriptions were preserved.');
    }
    await waitForPoll(options.signal);
    response = await readTimelineJob(response.job.id, options.signal);
  }
  throw new Error('Still processing. Check the same request again; do not start a duplicate.');
}

export async function cancelTimelineJob(jobId: string) {
  const response = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', credentials: 'same-origin' });
  if (!response.ok) throw new Error(formatApiError((await response.json().catch(() => null))?.error));
}

export function timelineFrameUrl(workspaceId: string, assetId: string, timeMs: number) {
  return `/api/timeline/frame?${new URLSearchParams({ workspaceId, assetId, timeMs: String(timeMs) })}`;
}

const frameAssetSchema = z.object({ asset: z.object({ id: z.string().uuid(), originalName: z.string(),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), width: z.number().nullable(),
  height: z.number().nullable(), createdAt: z.string() }) });

export async function prepareTimelineFrame(workspaceId: string, assetId: string, timeMs: number, signal?: AbortSignal) {
  const response = await fetch(`${timelineFrameUrl(workspaceId, assetId, timeMs)}&format=json`, {
    credentials: 'same-origin', signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(formatApiError(payload?.error ?? 'Не удалось подготовить стоп-кадр.'));
  return mapRemoteImageAsset(frameAssetSchema.parse(payload).asset);
}

/** A simultaneous output/download request reuses the same deterministic clip once ready. */
export async function prepareTimelineClip(workspaceId: string, assetId: string, startMs: number, endMs: number, signal: AbortSignal) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    signal.throwIfAborted();
    try { return await deriveRemoteVideoAsset({ workspaceId, assetId, kind: 'trim', range: { startMs, endMs } }, fetch, signal); }
    catch (error) {
      if (!(error instanceof AssetClientError) || ![409, 503].includes(error.status) || Date.now() >= deadline) throw error;
      await waitForPoll(signal);
    }
  }
}

function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
