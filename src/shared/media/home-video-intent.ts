import { z } from 'zod';
import type { VideoGenerationRequest } from './video-generation-contracts';
import { VIDEO_GRAIN_OPTIONS, VIDEO_LOOK_OPTIONS, VIDEO_MOVEMENT_OPTIONS, VIDEO_OPTICS_OPTIONS, VIDEO_SPEED_OPTIONS } from './video-cinematic-catalog';
import { videoDirectionSchema } from './home-video-direction';
import { compileVideoDirection } from './video-direction-prompt';

export const HOME_VIDEO_SLOT_IDS = ['firstFrame', 'lastFrame', 'reference1', 'reference2', 'reference3'] as const;
export type HomeVideoSlotId = typeof HOME_VIDEO_SLOT_IDS[number];
export const DEFAULT_VIDEO_CAMERA = { optics: 'auto', look: 'auto', grain: 'auto', movement: 'auto', speed: 'auto' } as const;
export const videoCameraSchema = z.object({
  optics: z.enum(VIDEO_OPTICS_OPTIONS.map((item) => item.id)).default('auto'),
  look: z.enum(VIDEO_LOOK_OPTIONS.map((item) => item.id)).default('auto'),
  grain: z.enum(VIDEO_GRAIN_OPTIONS.map((item) => item.id)).default('auto'),
  movement: z.enum(VIDEO_MOVEMENT_OPTIONS.map((item) => item.id)).default('auto'),
  speed: z.enum(VIDEO_SPEED_OPTIONS.map((item) => item.id)).default('auto'),
}).strict();
export type VideoCameraSettings = z.infer<typeof videoCameraSchema>;
const slotSchema = z.object({ attachmentId: z.string().min(1).max(160), description: z.string().trim().max(2_000).default('') }).strict();
export const homeVideoSlotsSchema = z.object({
  firstFrame: slotSchema.optional(), lastFrame: slotSchema.optional(), reference1: slotSchema.optional(),
  reference2: slotSchema.optional(), reference3: slotSchema.optional(),
}).strict();
export type HomeVideoSlots = z.infer<typeof homeVideoSlotsSchema>;
export const homeVideoIntentSchema = z.object({
  version: z.literal(1).default(1), slots: homeVideoSlotsSchema.default({}), camera: videoCameraSchema.default(DEFAULT_VIDEO_CAMERA),
  direction: videoDirectionSchema.optional(),
}).strict();
export type HomeVideoIntent = z.infer<typeof homeVideoIntentSchema>;
export const DEFAULT_HOME_VIDEO_INTENT: HomeVideoIntent = { version: 1, slots: {}, camera: DEFAULT_VIDEO_CAMERA };

export class HomeVideoIntentError extends Error {}

export function orderedHomeVideoSlots(slots: HomeVideoSlots) {
  return HOME_VIDEO_SLOT_IDS.flatMap((id) => slots[id] ? [{ id, ...slots[id]! }] : []);
}

export function resolveHomeVideoIntentMode(slots: HomeVideoSlots): VideoGenerationRequest['mode'] {
  const images = orderedHomeVideoSlots(slots);
  const frames = Boolean(slots.firstFrame || slots.lastFrame);
  const references = Boolean(slots.reference1 || slots.reference2 || slots.reference3);
  if (frames && references) throw new HomeVideoIntentError('Кадры и референсы нельзя смешивать. Оставьте первый/последний кадр или только референсы.');
  if (slots.lastFrame && !slots.firstFrame) throw new HomeVideoIntentError('Добавьте первый кадр, чтобы использовать последний.');
  if (new Set(images.map((image) => image.attachmentId)).size !== images.length) throw new HomeVideoIntentError('Одно изображение уже занимает другой слот. Уберите повторное вложение.');
  return frames ? 'frames' : references ? 'references' : 'text';
}

export function compileHomeVideoPrompt(originalPrompt: string, intent: HomeVideoIntent) {
  const camera = videoCameraSchema.parse(intent.camera);
  const instructions = [
    VIDEO_OPTICS_OPTIONS.find((item) => item.id === camera.optics)!.instruction,
    VIDEO_LOOK_OPTIONS.find((item) => item.id === camera.look)!.instruction,
    VIDEO_GRAIN_OPTIONS.find((item) => item.id === camera.grain)!.instruction,
    VIDEO_MOVEMENT_OPTIONS.find((item) => item.id === camera.movement)!.instruction,
    camera.movement === 'static' ? '' : VIDEO_SPEED_OPTIONS.find((item) => item.id === camera.speed)!.instruction,
  ].filter(Boolean);
  const notes = orderedHomeVideoSlots(intent.slots).filter((slot) => slot.description).map((slot) => `${slot.id}: ${JSON.stringify(slot.description)}`);
  const compiled = [originalPrompt,
    intent.direction ? compileVideoDirection(intent.direction)
      : instructions.length ? `[Cinematic direction]\n${instructions.join('\n')}\nThese are desired visual qualities, not assertions about physical equipment.\n[/Cinematic direction]` : '',
    notes.length ? `[User-supplied image notes]\n${notes.join('\n')}\n[/User-supplied image notes]` : '',
  ].filter(Boolean).join('\n\n');
  if (compiled.length > 20_000) throw new HomeVideoIntentError('Сократите описание или подписи к изображениям: вместе с настройками камеры они превышают допустимую длину.');
  return compiled;
}

/** Resolves only the product intent. Provider capability validation follows on the server. */
export function buildHomeVideoIntentRequest(request: VideoGenerationRequest, intent: HomeVideoIntent,
  resolveAssetId: (attachmentId: string) => string): VideoGenerationRequest {
  const mode = resolveHomeVideoIntentMode(intent.slots);
  const image = (id: HomeVideoSlotId) => intent.slots[id]
    ? { assetId: resolveAssetId(intent.slots[id]!.attachmentId), description: intent.slots[id]!.description } : undefined;
  return { ...request, mode, prompt: compileHomeVideoPrompt(request.prompt, intent),
    firstFrame: image('firstFrame'), lastFrame: image('lastFrame'),
    references: (['reference1', 'reference2', 'reference3'] as const).flatMap((id, index) => {
      const value = image(id); return value ? [{ ...value, slot: index + 1 }] : [];
    }),
  };
}
