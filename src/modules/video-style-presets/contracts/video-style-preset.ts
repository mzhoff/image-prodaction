import { z } from 'zod';
import { isUuid, isUuidV7 } from '@/shared/lib/id';
import { videoStyleSettingsSchema } from '@/shared/media/home-video-direction';

export const videoStylePresetFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  style: videoStyleSettingsSchema,
  coverAssetId: z.string().refine(isUuidV7).nullable().default(null),
}).strict();
export const saveVideoStylePresetSchema = videoStylePresetFieldsSchema.extend({
  expectedRevision: z.number().int().min(0),
}).strict();
export const videoStylePresetSchema = videoStylePresetFieldsSchema.extend({
  id: z.string().refine(isUuidV7), workspaceId: z.string().refine(isUuid),
  revision: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string(),
});
export type VideoStylePresetFields = z.infer<typeof videoStylePresetFieldsSchema>;
export type SaveVideoStylePreset = z.infer<typeof saveVideoStylePresetSchema>;
export type VideoStylePreset = z.infer<typeof videoStylePresetSchema>;
