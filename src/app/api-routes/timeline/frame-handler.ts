import { z } from 'zod';
import { apiError } from '@/shared/api/api-error';
import { isUuid, isUuidV7 } from '@/shared/lib/id';
import { MAX_TIMELINE_DURATION_MS } from '@/shared/media/timeline-contracts';
import type { AssetDto } from '@/entities/asset/server/asset-service-contracts';

const frameSchema = z.object({ workspaceId: z.string().refine(isUuid), assetId: z.string().refine(isUuidV7),
  timeMs: z.coerce.number().finite().min(0).max(MAX_TIMELINE_DURATION_MS), format: z.enum(['json', 'image']).optional(),
}).strict();
export function createTimelineFrameRequest(dependencies: {
  userId(request: Request): Promise<string>;
  authorize(userId: string, workspaceId: string): Promise<unknown>;
  frame(input: { userId: string; workspaceId: string; assetId: string; timeMs: number; signal: AbortSignal }): Promise<{ assetId: string; bytes: Uint8Array }>;
  metadata(userId: string, assetId: string): Promise<AssetDto>;
  error(error: unknown): Response;
}) {
  return async (request: Request) => {
    try {
      const userId = await dependencies.userId(request);
      const { format, ...input } = frameSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      await dependencies.authorize(userId, input.workspaceId);
      const frame = await dependencies.frame({ ...input, userId, signal: request.signal });
      const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
      if (format === 'json') return Response.json({ asset: await dependencies.metadata(userId, frame.assetId) }, { headers });
      return new Response(new Uint8Array(frame.bytes), { headers: { ...headers, 'Content-Type': 'image/jpeg', 'X-Asset-Id': frame.assetId } });
    } catch (error) { return error instanceof z.ZodError ? apiError('invalid_timeline_frame', 'Choose a valid frame.', 400) : dependencies.error(error); }
  };
}
