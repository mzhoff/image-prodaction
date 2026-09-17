import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { loadVideoCatalog } from '@/modules/provider-connections/adapters/openrouter-video-catalog';
import { submitGenerationJob, toPublicGenerationJob } from '@/modules/generation/server/generation-submission-service';
import { validateVideoAssets, type QueuedVideoPayload } from '@/modules/generation/server/video-generation-input';
import { validateVideoRequest, videoRequestSchema } from '@/shared/media/video-generation-contracts';
import { readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { apiError } from '@/shared/api/api-error';
import { toApiErrorResponse } from '../error-response';

const schema = z.object({ workspaceId: z.string().uuid(), documentId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200), request: videoRequestSchema }).strict();
export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const parsed = schema.safeParse(await readBoundedJsonObject(request, 64 * 1024));
    if (!parsed.success) return apiError('invalid_video_request', 'Проверьте параметры генерации видео.', 400);
    const { idempotencyKey, ...payload } = parsed.data satisfies QueuedVideoPayload & { idempotencyKey: string };
    await resolveOpenRouterCredential(session.user.id, payload.workspaceId);
    const model = (await loadVideoCatalog()).find((model) => model.key === payload.request.model);
    const error = validateVideoRequest(payload.request, model);
    if (error) return apiError('invalid_video_request', error, 400);
    await validateVideoAssets(payload.request, session.user.id, payload.workspaceId);
    const job = await submitGenerationJob({ userId: session.user.id, workspaceId: payload.workspaceId,
      documentId: payload.documentId, operation: 'generate_video', provider: model!.route.gateway, modelId: model!.route.modelId,
      idempotencyKey, maxAttempts: 3, payload,
      metadata: { requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), modelKey: payload.request.model, mode: payload.request.mode },
    });
    return Response.json({ job: toPublicGenerationJob(job) }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return toApiErrorResponse(error); }
}
