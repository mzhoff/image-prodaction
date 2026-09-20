import { getOpenRouterBaseUrl } from '@/shared/api/openrouter-endpoint';
import { z } from 'zod';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import { MAX_VIDEO_OUTPUT_BYTES } from '@/shared/media/video-contracts';
import { normalizeProviderCostUsd } from '@/shared/lib/provider-cost-decimal';
import type { VideoProviderAdapter, VideoProviderContext, VideoProviderInput, VideoProviderStatus } from '../contracts/video-provider';
import { normalizeVideoProviderDiagnostic, VideoProviderError } from '../core/video-provider-error';

const ORIGIN = `${getOpenRouterBaseUrl()}/videos`;
const operationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const statusSchema = z.object({
  id: operationIdSchema, status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired']),
  generation_id: z.string().nullish(),
  error: z.unknown().optional(),
  usage: z.object({ cost: z.union([z.number().nonnegative(), z.string()]).nullable().optional() }).nullish(),
});
export function buildVideoProviderBody(input: VideoProviderInput) {
  const ordered = [...input.references].sort((a, b) => a.slot - b.slot);
  const descriptions = ordered.map((ref, index) => `Image ${index + 1} (reference input ${ref.slot}): ${ref.description || 'Use as visual reference.'}`).join('\n');
  return {
    model: input.model, prompt: [input.prompt, descriptions].filter(Boolean).join('\n\nReference guidance:\n'),
    duration: input.duration, resolution: input.resolution, aspect_ratio: input.aspectRatio,
    generate_audio: input.generateAudio, ...(input.seed === undefined ? {} : { seed: input.seed }),
    ...(input.mode === 'frames' ? { frame_images: [
      ...(input.firstFrame ? [{ type: 'image_url', image_url: { url: input.firstFrame }, frame_type: 'first_frame' }] : []),
      ...(input.lastFrame ? [{ type: 'image_url', image_url: { url: input.lastFrame }, frame_type: 'last_frame' }] : []),
    ] } : {}),
    ...(input.mode === 'references' ? { input_references: ordered.map((ref) => ({ type: 'image_url', image_url: { url: ref.url } })) } : {}),
  };
}
export function createOpenRouterVideoAdapter(request: typeof fetch = fetch): VideoProviderAdapter {
  const json = async (url: string, context: VideoProviderContext, body?: unknown, prompt?: string) => {
    const response = await request(url, { method: body ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.any([context.signal, AbortSignal.timeout(60_000)]),
      headers: { Authorization: `Bearer ${context.credential}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      let error: unknown;
      try {
        const bytes = response.body && await readBoundedAudioStream(response.body, 64 * 1024, context.signal);
        if (bytes) error = JSON.parse(new TextDecoder().decode(bytes));
      } catch { /* HTTP status remains useful when the upstream body is not bounded JSON. */ }
      throw new VideoProviderError(normalizeVideoProviderDiagnostic({ body: error, httpStatus: response.status,
        requestId: response.headers.get('x-request-id'), secrets: [context.credential, prompt ?? '', ...context.redactions ?? []] }));
    }
    const status = statusSchema.parse(await response.json());
    const cost = normalizeProviderCostUsd(status.usage?.cost == null ? null : String(status.usage.cost));
    return { operationId: status.id, status: status.status, generationId: status.generation_id ?? undefined,
      failure: status.error ? normalizeVideoProviderDiagnostic({ body: status.error, httpStatus: null,
        requestId: response.headers.get('x-request-id'), secrets: [context.credential, prompt ?? '', ...context.redactions ?? []] }) : undefined,
      usage: { providerCostUsd: cost, complete: cost !== null, inputTokens: null, outputTokens: null,
        totalTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null } } satisfies VideoProviderStatus;
  };
  return {
    submit: (input, context) => { const body = buildVideoProviderBody(input); return json(ORIGIN, context, body, body.prompt); },
    async poll(id, context) {
      const status = await json(`${ORIGIN}/${operationIdSchema.parse(id)}`, context);
      if (status.operationId !== id) throw new Error('Video provider returned a different operation ID.');
      return status;
    },
    async download(id, context) {
      // Never follow arbitrary polling/unsigned URLs with a workspace credential.
      const response = await request(`${ORIGIN}/${operationIdSchema.parse(id)}/content?index=0`, {
        redirect: 'error', signal: AbortSignal.any([context.signal, AbortSignal.timeout(120_000)]),
        headers: { Authorization: `Bearer ${context.credential}` },
      });
      if (!response.ok || !response.body) throw new Error(`Video download failed (HTTP ${response.status}).`);
      const size = Number(response.headers.get('content-length'));
      if (size > MAX_VIDEO_OUTPUT_BYTES) { await response.body.cancel(); throw new Error('Video exceeds 128 MiB.'); }
      return readBoundedAudioStream(response.body, MAX_VIDEO_OUTPUT_BYTES, context.signal);
    },
  };
}
