import { readAuthServerConfig } from '@/shared/auth/config';
import { submitAssetIngest } from '@/modules/generation/server/asset-ingest-submission';
import { withStreamingUpload } from '@/shared/media/streaming-upload';
import { z } from 'zod';
import {
  getMaxImageUploadBytes,
} from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { isUuid } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';


const uploadFieldsSchema = z.object({
  documentId: z.string().refine(isUuid).nullable(),
  origin: z.enum(['uploaded', 'saved']),
  workspaceId: z.string().refine(isUuid),
});

export async function postAssetImage(request: Request) {
  try {
    if (!readAuthServerConfig().trustedOrigins.includes(request.headers.get('origin') ?? '')) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
    const session = await requireApiSession(request);
    const maxBytes = getMaxImageUploadBytes();
    return await withStreamingUpload(request, maxBytes, ['file', 'workspaceId', 'documentId', 'origin'], async ({ file, form: formData }) => {
    const parsedFields = uploadFieldsSchema.safeParse({
      workspaceId: getStringField(formData, 'workspaceId'),
      documentId: getStringField(formData, 'documentId') || null,
      origin: getStringField(formData, 'origin'),
    });
    if (!parsedFields.success) {
      return apiError(
        'invalid_asset_scope',
        'Valid workspaceId, documentId, and durable asset origin fields are required.',
        400,
      );
    }

    const accepted = await submitAssetIngest({ ...parsedFields.data, file, mediaKind: 'image', userId: session.user.id, signal: request.signal });
    return Response.json(accepted, { status: 202, headers: { 'Cache-Control': 'private, no-store', Location: accepted.statusUrl } });
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}

function getStringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
