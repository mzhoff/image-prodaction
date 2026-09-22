import { z } from 'zod';
import { VIDEO_REFERENCE_LIMIT, type VideoGenerationRequest } from './video-generation-contracts';
import { VIDEO_GRAIN_OPTIONS, VIDEO_LOOK_OPTIONS, VIDEO_MOVEMENT_OPTIONS, VIDEO_OPTICS_OPTIONS, VIDEO_SPEED_OPTIONS } from './video-cinematic-catalog';
import { VIDEO_ANGLE_OPTIONS, VIDEO_FOCUS_OPTIONS, VIDEO_FRAMING_OPTIONS, VIDEO_LIGHTING_OPTIONS, VIDEO_TEMPERATURE_OPTIONS, VIDEO_TIME_OF_DAY_OPTIONS } from './video-direction-catalog';
export * from './video-direction-catalog';

const lookSchema = z.enum(VIDEO_LOOK_OPTIONS.map((item) => item.id));
const grainSchema = z.enum(VIDEO_GRAIN_OPTIONS.map((item) => item.id));
const stylePromptSchema = z.string().trim().max(2_000);
export const videoStyleSettingsSchema = z.object({
  look: lookSchema.default('auto'), grain: grainSchema.default('auto'), prompt: stylePromptSchema.default(''),
}).strict();
export type VideoStyleSettings = z.infer<typeof videoStyleSettingsSchema>;
export const DEFAULT_VIDEO_STYLE: VideoStyleSettings = videoStyleSettingsSchema.parse({});
export const videoStyleOverrideSchema = z.object({
  look: lookSchema.optional(), grain: grainSchema.optional(), prompt: stylePromptSchema.optional(),
}).strict();
export type VideoStyleOverride = z.infer<typeof videoStyleOverrideSchema>;

const description = z.string().trim().max(4_000).default('');
const storySchema = z.object({
  description, style: videoStyleSettingsSchema.default(DEFAULT_VIDEO_STYLE),
  subjectIds: z.array(z.string().uuid()).max(3).refine((ids) => new Set(ids).size === ids.length, 'Не выбирайте одного героя несколько раз.').default([]),
}).strict();
const sceneSchema = z.object({
  description, location: z.string().trim().max(2_000).default(''),
  timeOfDay: z.enum(VIDEO_TIME_OF_DAY_OPTIONS.map((item) => item.id)).default('auto'),
  lighting: z.enum(VIDEO_LIGHTING_OPTIONS.map((item) => item.id)).default('auto'),
  temperature: z.enum(VIDEO_TEMPERATURE_OPTIONS.map((item) => item.id)).default('auto'),
  lightSources: z.string().trim().max(2_000).default(''), styleOverride: videoStyleOverrideSchema.optional(),
}).strict();
const shotSchema = z.object({
  description,
  framing: z.enum(VIDEO_FRAMING_OPTIONS.map((item) => item.id)).default('auto'),
  angle: z.enum(VIDEO_ANGLE_OPTIONS.map((item) => item.id)).default('auto'),
  focus: z.enum(VIDEO_FOCUS_OPTIONS.map((item) => item.id)).default('auto'),
  optics: z.enum(VIDEO_OPTICS_OPTIONS.map((item) => item.id)).default('auto'),
  movement: z.enum(VIDEO_MOVEMENT_OPTIONS.map((item) => item.id)).default('auto'),
  speed: z.enum(VIDEO_SPEED_OPTIONS.map((item) => item.id)).default('auto'),
  styleOverride: videoStyleOverrideSchema.optional(),
}).strict();
export const videoDirectionSchema = z.object({
  story: storySchema.default(() => storySchema.parse({})),
  scene: sceneSchema.default(() => sceneSchema.parse({})),
  shot: shotSchema.default(() => shotSchema.parse({})),
}).strict();
export type VideoDirectionSettings = z.infer<typeof videoDirectionSchema>;
export const DEFAULT_VIDEO_DIRECTION: VideoDirectionSettings = videoDirectionSchema.parse({});
export interface VideoDirectionSubjectImage { id: string; name: string; referenceAssetId?: string }
export class VideoDirectionInputError extends Error {}

/** Character portraits use the same provider reference budget as attached images. */
export function mergeVideoDirectionSubjectImages(request: VideoGenerationRequest, subjects: readonly VideoDirectionSubjectImage[]): VideoGenerationRequest {
  const images = subjects.filter((subject) => subject.referenceAssetId);
  if (!images.length) return request;
  if (request.firstFrame || request.lastFrame || request.mode === 'frames') {
    throw new VideoDirectionInputError('Фото героев нельзя совместить с первым и последним кадром в этой генерации. Уберите кадры, чтобы использовать референсы, или уберите героев с фото.');
  }
  if (request.references.length + images.length > VIDEO_REFERENCE_LIMIT) {
    throw new VideoDirectionInputError('Можно использовать не больше трёх изображений суммарно: фото героев и референсы. Уберите лишние изображения.');
  }
  const references = [...request.references];
  for (const subject of images) {
    const slot = [1, 2, 3].find((value) => !references.some((reference) => reference.slot === value));
    if (!slot) throw new VideoDirectionInputError('Для фото героя не осталось свободного слота референса.');
    references.push({ assetId: subject.referenceAssetId!, description: `Персонаж: ${subject.name}`.slice(0, 2_000), slot });
  }
  return { ...request, mode: 'references', references: references.sort((a, b) => a.slot - b.slot) };
}

/** Omitted properties inherit. Explicit auto/empty values reset that property. */
export function resolveVideoDirectionStyle(direction: VideoDirectionSettings): VideoStyleSettings {
  const style = { ...direction.story.style };
  for (const override of [direction.scene.styleOverride, direction.shot.styleOverride]) {
    if (override?.look !== undefined) style.look = override.look;
    if (override?.grain !== undefined) style.grain = override.grain;
    if (override?.prompt !== undefined) style.prompt = override.prompt;
  }
  return style;
}
