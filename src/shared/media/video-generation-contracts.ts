import { z } from 'zod';

/** Product limits, not promises about a supplier's maximum. */
export const VIDEO_REFERENCE_LIMIT = 3;
export const DEFAULT_VIDEO_MODEL = 'google/veo-3.1-lite';
export const VIDEO_GENERATION_TIMEOUT_MS = 45 * 60_000;
export const videoSettingsSchema = z.object({
  model: z.string().min(1).max(160),
  mode: z.enum(['text', 'frames', 'references']),
  prompt: z.string().max(20_000).default(''),
  duration: z.number().int().min(1).max(30),
  resolution: z.string().min(1).max(16),
  aspectRatio: z.string().min(1).max(16),
  generateAudio: z.boolean().default(false),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
});
export type VideoSettings = z.infer<typeof videoSettingsSchema>;
const imageSchema = z.object({ assetId: z.string().uuid(), description: z.string().max(2_000).default('') }).strict();
export const videoRequestSchema = videoSettingsSchema.extend({
  firstFrame: imageSchema.optional(), lastFrame: imageSchema.optional(),
  references: z.array(imageSchema.extend({ slot: z.number().int().min(1).max(VIDEO_REFERENCE_LIMIT) })).max(VIDEO_REFERENCE_LIMIT).default([]),
}).strict();
export type VideoGenerationRequest = z.infer<typeof videoRequestSchema>;

/** Model identity is independent of the gateway route. Publisher names are not gateway names. */
export interface VideoModelCapabilities {
  key: string; label: string; description: string;
  route: { gateway: 'openrouter'; modelId: string };
  durations: number[]; resolutions: string[]; aspectRatios: string[];
  supportedSizes?: string[];
  firstFrame: boolean; lastFrame: boolean; references: boolean;
  audio: boolean; seed: boolean;
}

const VIDEO_MODEL_PUBLISHER_PREFIXES: Array<[modelPrefix: string, labelPrefix: RegExp]> = [
  ['google/', /^Google\s*:\s*/i],
  ['kwaivgi/', /^(?:Kuaishou|Kwaivgi)\s*:\s*/i],
  ['bytedance/', /^ByteDance\s*:\s*/i],
  ['alibaba/', /^Alibaba\s*:\s*/i],
  ['openai/', /^OpenAI\s*:\s*/i],
  ['runway/', /^Runway\s*:\s*/i],
  ['minimax/', /^MiniMax\s*:\s*/i],
  ['x-ai/', /^(?:xAI|x\.AI)\s*:\s*/i],
];

export function getVideoModelDisplayName(modelKey: string, catalogLabel: string) {
  const prefix = VIDEO_MODEL_PUBLISHER_PREFIXES.find(([candidate]) => modelKey.startsWith(candidate))?.[1];
  return (prefix ? catalogLabel.replace(prefix, '') : catalogLabel).trim() || catalogLabel;
}
export function validateVideoRequest(request: VideoGenerationRequest, model?: VideoModelCapabilities): string | undefined {
  if (!model || model.key !== request.model) return 'Модель отсутствует в актуальном каталоге видео.';
  if (!request.prompt.trim()) return 'Добавьте текстовое задание для видеофрагмента.';
  if (!model.durations.includes(request.duration) || !model.resolutions.includes(request.resolution)
    || !model.aspectRatios.includes(request.aspectRatio)) return 'Длительность, разрешение или формат кадра недоступны для этой модели. Выберите значения из каталога.';
  if (request.generateAudio && !model.audio) return 'Модель не поддерживает генерацию звука.';
  if (request.seed !== undefined && !model.seed) return 'Модель не поддерживает seed.';
  if (request.mode === 'text' && (request.firstFrame || request.lastFrame || request.references.length)) return 'В режиме «По тексту» изображения не используются. Выберите другой режим или отсоедините изображения.';
  if (request.mode === 'frames') {
    if (!request.firstFrame || !model.firstFrame) return 'Подключите первый кадр и выберите модель с поддержкой первого кадра.';
    if (request.lastFrame && !model.lastFrame) return 'Эта модель не поддерживает последний кадр.';
    if (request.references.length) return 'Кадры и референсы — разные режимы. Отсоедините референсы, чтобы они не были проигнорированы.';
  }
  if (request.mode === 'references') {
    if (!model.references || !request.references.length) return 'Подключите референсы и выберите модель с подтверждённой поддержкой референсов.';
    if (request.firstFrame || request.lastFrame) return 'Отсоедините первый/последний кадр: они переключают API в другой режим.';
  }
  if (new Set(request.references.map((ref) => ref.slot)).size !== request.references.length) return 'Номер входа референса не должен повторяться.';
}
