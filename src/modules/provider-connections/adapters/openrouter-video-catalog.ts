import { getOpenRouterBaseUrl } from '@/shared/api/openrouter-endpoint';
import { z } from 'zod';
import { getVideoModelDisplayName, type VideoModelCapabilities } from '@/shared/media/video-generation-contracts';

const rawModel = z.object({
  id: z.string(), name: z.string(), description: z.string().default(''),
  supported_durations: z.array(z.number()).nullable(), supported_resolutions: z.array(z.string()).nullable(),
  supported_aspect_ratios: z.array(z.string()).nullable(), supported_frame_images: z.array(z.string()).nullable(),
  supported_sizes: z.array(z.string()).nullable().optional(),
  generate_audio: z.boolean().nullable(), seed: z.boolean().nullable(),
});
// Deliberately excludes edit/upscale/avatar models; new families need contract review.
const generationFamilies = /^(google\/veo-|kwaivgi\/kling-|bytedance\/seedance-|alibaba\/wan-|openai\/sora-|runway\/gen-|minimax\/hailuo-|x-ai\/grok-imagine-video)/;
// No structured reference flag yet. Explicitly verified from the current cookbook/model descriptions.
const referenceModels = new Set(['bytedance/seedance-2.0', 'bytedance/seedance-2.0-fast',
  'bytedance/seedance-2.0-mini', 'bytedance/seedance-2.5', 'alibaba/wan-2.7', 'alibaba/wan-3.0']);
export function normalizeVideoCatalog(value: unknown): VideoModelCapabilities[] {
  const { data } = z.object({ data: z.array(z.unknown()) }).parse(value);
  return data.flatMap((value) => {
    const model = rawModel.safeParse(value).data;
    if (!model || !generationFamilies.test(model.id) || /edit|upscale|avatar/i.test(model.id)) return [];
    const durations = [...new Set(model.supported_durations ?? [])].filter((n) => Number.isInteger(n) && n > 0 && n <= 30).sort((a, b) => a - b);
    const resolutions = model.supported_resolutions ?? [];
    const aspectRatios = model.supported_aspect_ratios ?? [];
    if (!durations.length || !resolutions.length || !aspectRatios.length) return [];
    return [{ key: model.id, label: getVideoModelDisplayName(model.id, model.name), description: model.description,
      route: { gateway: 'openrouter' as const, modelId: model.id }, durations, resolutions, aspectRatios,
      supportedSizes: (model.supported_sizes ?? []).filter((size) => /^\d+x\d+$/.test(size)),
      firstFrame: model.supported_frame_images?.includes('first_frame') === true,
      lastFrame: model.supported_frame_images?.includes('last_frame') === true,
      references: referenceModels.has(model.id), audio: model.generate_audio === true, seed: model.seed === true }];
  });
}
let cache: { expires: number; models: VideoModelCapabilities[] } | undefined;
let pending: Promise<VideoModelCapabilities[]> | undefined;
export async function loadVideoCatalog(): Promise<VideoModelCapabilities[]> {
  if (cache && cache.expires > Date.now()) return cache.models;
  pending ??= fetch(`${getOpenRouterBaseUrl()}/videos/models`, { signal: AbortSignal.timeout(15_000), redirect: 'error' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Каталог видеомоделей временно недоступен.');
      const models = normalizeVideoCatalog(await response.json());
      if (!models.length) throw new Error('Каталог не содержит совместимых видеомоделей.');
      cache = { models, expires: Date.now() + 5 * 60_000 }; return models;
    }).finally(() => { pending = undefined; });
  return pending;
}
