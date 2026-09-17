import { z } from 'zod';
import { uploadVideoAsset } from '@/entities/asset/server/video-asset-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';
import { readAuthServerConfig } from '@/shared/auth/config';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { VideoProcessingError, MAX_VIDEO_BYTES } from '@/shared/media/video-contracts';
import { readVideoMultipart, withVideoUploadLimit } from '@/shared/media/video-upload-request';
import { toAssetApiErrorResponse } from './error-response';

const fieldsSchema = z.object({ workspaceId: z.string().refine(isUuid), documentId: z.string().refine(isUuid).nullable(), origin: z.enum(['uploaded', 'saved']).default('uploaded') });
export async function postAssetVideo(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
    const session = await requireApiSession(request);
    return await withVideoUploadLimit(async () => {
      const { file, form } = await readVideoMultipart(request, ['file', 'workspaceId', 'documentId', 'origin']);
      const fields = fieldsSchema.safeParse({ workspaceId: form.get('workspaceId'), documentId: form.get('documentId') || null, origin: form.get('origin') || undefined });
      if (!fields.success) return apiError('invalid_asset_scope', 'Valid Workspace, document and origin fields are required.', 400);
      const asset = await uploadVideoAsset({ ...fields.data, bytes: new Uint8Array(await file.arrayBuffer()), claimedContentType: file.type,
        libraryVisible: true, maxBytes: MAX_VIDEO_BYTES, originalName: file.name, userId: session.user.id, signal: request.signal });
      return Response.json({ asset }, { status: 201, headers: { 'Cache-Control': 'private, no-store', Location: `/api/assets/${asset.id}`, 'X-Content-Type-Options': 'nosniff' } });
    });
  } catch (error) {
    if (error instanceof VideoProcessingError || error instanceof AudioProcessingError) return apiError(error.code, error.message, error.status);
    return toAssetApiErrorResponse(error);
  }
}
