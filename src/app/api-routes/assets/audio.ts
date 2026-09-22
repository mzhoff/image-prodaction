import { submitAssetIngest } from '@/modules/generation/server/asset-ingest-submission';
import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';
import { readAuthServerConfig } from '@/shared/auth/config';
import { AudioProcessingError, MAX_AUDIO_BYTES } from '@/shared/media/audio-contracts';
import { withStreamingUpload } from '@/shared/media/streaming-upload';
import { toAssetApiErrorResponse } from './error-response';

const fieldsSchema = z.object({ workspaceId: z.string().refine(isUuid), documentId: z.string().refine(isUuid).nullable(), origin: z.enum(['uploaded', 'saved']) });
export async function postAssetAudio(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
    const session = await requireApiSession(request);
    return await withStreamingUpload(request, MAX_AUDIO_BYTES, ['file', 'workspaceId', 'documentId', 'origin'], async ({ file, form }) => {
    const fields = fieldsSchema.safeParse({ workspaceId: form.get('workspaceId'), documentId: form.get('documentId') || null, origin: form.get('origin') });
    if (!fields.success) return apiError('invalid_asset_scope', 'Valid Workspace, document and origin fields are required.', 400);
    const accepted = await submitAssetIngest({ ...fields.data, file, mediaKind: 'audio', userId: session.user.id, signal: request.signal });
    return Response.json(accepted, { status: 202, headers: { 'Cache-Control': 'private, no-store', Location: accepted.statusUrl } });
    });
  } catch (error) {
    if (error instanceof AudioProcessingError) return apiError(error.code, error.message, error.status);
    return toAssetApiErrorResponse(error);
  }
}
