import { z } from 'zod';

/** Optional settings for OpenRouter's raster Images API. One run produces one asset. */
export const imageGenerationOptionsSchema = z.object({
  imageQuality: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  imageBackground: z.enum(['auto', 'transparent', 'opaque']).optional(),
  imageFormat: z.enum(['png', 'jpeg', 'webp']).optional(),
  imageCompression: z.number().int().min(0).max(100).optional(),
  imageSeed: z.number().int().min(0).max(2_147_483_647).optional(),
}).strict();

export type ImageGenerationOptions = z.infer<typeof imageGenerationOptionsSchema>;

export function pickImageGenerationOptions(value: ImageGenerationOptions): ImageGenerationOptions {
  return Object.fromEntries(Object.entries({
    imageQuality: value.imageQuality, imageBackground: value.imageBackground,
    imageFormat: value.imageFormat, imageCompression: value.imageCompression, imageSeed: value.imageSeed,
  }).filter(([, item]) => item !== undefined));
}
