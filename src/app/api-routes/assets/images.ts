import { z } from 'zod';
import { uploadImageAsset } from '@/entities/asset/server/asset-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from './error-response';

const DEFAULT_MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

const uploadFieldsSchema = z.object({
  documentId: z.string().refine(isUuidV7).nullable(),
  workspaceId: z.string().refine(isUuidV7),
});

export async function postAssetImage(request: Request) {
  try {
    const session = await requireApiSession(request);
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('multipart/form-data')) {
      return apiError('invalid_content_type', 'A multipart form upload is required.', 415);
    }

    const maxBytes = getMaxImageUploadBytes();
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes + MAX_MULTIPART_OVERHEAD_BYTES) {
      return apiError('file_too_large', 'The image exceeds the upload limit.', 413);
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) return apiError('invalid_multipart', 'The multipart upload is invalid.', 400);
    const file = formData.get('file');
    if (!(file instanceof File)) return apiError('missing_file', 'An image file is required.', 400);
    if (file.size > maxBytes) return apiError('file_too_large', 'The image exceeds the upload limit.', 413);

    const parsedFields = uploadFieldsSchema.safeParse({
      workspaceId: getStringField(formData, 'workspaceId'),
      documentId: getStringField(formData, 'documentId') || null,
    });
    if (!parsedFields.success) {
      return apiError('invalid_asset_scope', 'Valid workspaceId and documentId fields are required.', 400);
    }

    const created = await uploadImageAsset({
      bytes: new Uint8Array(await file.arrayBuffer()),
      claimedContentType: file.type,
      documentId: parsedFields.data.documentId,
      maxBytes,
      originalName: file.name,
      userId: session.user.id,
      workspaceId: parsedFields.data.workspaceId,
    });
    return Response.json({ asset: created }, {
      status: 201,
      headers: {
        'Cache-Control': 'no-store',
        Location: `/api/assets/${created.id}`,
      },
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}

function getStringField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function getMaxImageUploadBytes() {
  const parsed = Number.parseInt(process.env.ASSET_MAX_IMAGE_BYTES ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_UPLOAD_BYTES;
}
