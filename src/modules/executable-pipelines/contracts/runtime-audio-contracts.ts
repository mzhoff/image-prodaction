import { z } from 'zod';
import { audioMetadataSchema, MAX_AUDIO_OUTPUT_BYTES } from '@/shared/media/audio-contracts';

export const runtimeAudioUploadResponseSchema = z.object({
  artifact: z.object({ kind: z.literal('audio'), assetId: z.uuid(), mimeType: audioMetadataSchema.shape.contentType,
    sizeBytes: z.number().int().positive().max(MAX_AUDIO_OUTPUT_BYTES), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    durationSeconds: audioMetadataSchema.shape.durationSeconds }).strict(),
  audio: audioMetadataSchema,
}).strict();
export type RuntimeAudioUploadResponse = z.infer<typeof runtimeAudioUploadResponseSchema>;
