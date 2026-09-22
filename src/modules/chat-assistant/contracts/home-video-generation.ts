import { z } from 'zod';
import { videoRequestSchema } from '@/shared/media/video-generation-contracts';
import { homeVideoIntentSchema } from '@/shared/media/home-video-intent';

export const homeVideoGenerationSchema = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().min(1).max(160),
  idempotencyKey: z.string().min(1).max(160),
  request: videoRequestSchema,
  attachmentIds: z.array(z.string().min(1).max(160)).max(3).default([]),
  intent: homeVideoIntentSchema.optional(),
}).strict();
export type HomeVideoGenerationInput = z.infer<typeof homeVideoGenerationSchema>;

export class HomeVideoGenerationError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(message: string, statusCode = 422, code = 'HOME_VIDEO_INVALID') {
    super(message); this.statusCode = statusCode; this.code = code;
  }
}
