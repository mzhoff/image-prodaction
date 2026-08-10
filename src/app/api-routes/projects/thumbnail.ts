import { z } from 'zod';
import { after } from 'next/server';
import {
  deleteAsset,
  getMaxImageUploadBytes,
  uploadImageAsset,
} from '@/entities/asset/server/asset-service';
import {
  getDocument,
  setDocumentThumbnail,
} from '@/entities/document/server/document-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from '../assets/error-response';

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const thumbnailModeSchema = z.enum(['auto', 'manual']);

export async function postProjectThumbnail(request: Request, projectId: string) {
  try {
    if (!isUuidV7(projectId)) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('multipart/form-data')) {
      return apiError('invalid_content_type', 'A multipart form upload is required.', 415);
    }

    const maxBytes = getMaxImageUploadBytes();
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes + MAX_MULTIPART_OVERHEAD_BYTES) {
      return apiError('file_too_large', 'The snapshot exceeds the upload limit.', 413);
    }

    const formData = await request.formData().catch(() => null);
    if (!formData) return apiError('invalid_multipart', 'The multipart upload is invalid.', 400);
    const file = formData.get('file');
    if (!(file instanceof File)) return apiError('missing_file', 'A snapshot image is required.', 400);
    if (file.size > maxBytes) return apiError('file_too_large', 'The snapshot exceeds the upload limit.', 413);
    const parsedMode = thumbnailModeSchema.safeParse(formData.get('mode'));
    if (!parsedMode.success) return apiError('invalid_thumbnail_mode', 'Snapshot mode must be auto or manual.', 400);

    const current = await getDocument(session.user.id, projectId);
    if (parsedMode.data === 'auto' && current.thumbnailMode === 'manual') {
      return Response.json({ project: current }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const asset = await uploadImageAsset({
      bytes: new Uint8Array(await file.arrayBuffer()),
      claimedContentType: file.type,
      documentId: projectId,
      maxBytes,
      libraryVisible: false,
      metadata: { purpose: 'document-thumbnail', mode: parsedMode.data },
      operation: 'document.thumbnail.capture',
      originalName: file.name,
      userId: session.user.id,
      workspaceId: current.workspaceId,
    });

    let update;
    try {
      update = await setDocumentThumbnail({
        assetId: asset.id,
        documentId: projectId,
        mode: parsedMode.data,
        userId: session.user.id,
      });
    } catch (error) {
      await deleteAsset(session.user.id, asset.id).catch(() => undefined);
      throw error;
    }

    if (!update.applied) {
      await deleteAsset(session.user.id, asset.id).catch(() => undefined);
      return Response.json({ project: update.project }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (update.previousAssetId && update.previousAssetId !== asset.id) {
      after(async () => {
        await deleteAsset(session.user.id, update.previousAssetId!).catch((error: unknown) => {
          console.error('Old document thumbnail cleanup failed', {
            assetId: update.previousAssetId,
            documentId: projectId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          });
        });
      });
    }

    return Response.json({ project: update.project }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}
