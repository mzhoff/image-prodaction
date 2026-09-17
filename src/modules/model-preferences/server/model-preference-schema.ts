import { z } from 'zod';
import { MODEL_MODALITIES, MODEL_TABS } from '@/shared/model-preferences/contracts';
const modelId = z.string().min(3).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u).refine((id) => id !== 'openrouter/auto');
const modality = z.enum(MODEL_MODALITIES);
export const modelPreferenceChangeSchema = z.discriminatedUnion('action', [
  z.object({ modality, action: z.literal('tab'), tab: z.enum(MODEL_TABS) }).strict(),
  z.object({ modality, action: z.literal('favorite'), modelId, favorite: z.boolean() }).strict(),
  z.object({ modality, action: z.literal('reorder'), favorites: z.array(modelId).max(500)
    .refine((ids) => new Set(ids).size === ids.length), expectedRevision: z.number().int().nonnegative() }).strict(),
]);
