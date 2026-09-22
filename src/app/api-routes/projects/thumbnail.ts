import { readFile } from 'node:fs/promises';
import { withStreamingUpload } from '@/shared/media/streaming-upload';
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
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { readAuthServerConfig } from '@/shared/auth/config';
import { isUuid } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from '../assets/error-response';

const thumbnailModeSchema = z.enum(['auto', 'manual']);

export async function postProjectThumbnail(request: Request, projectId: string) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
    if (!isUuid(projectId)) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    const maxBytes = getMaxImageUploadBytes();
    return await withStreamingUpload(request, maxBytes, ['file', 'mode', 'expectedRevision'], async ({ file, form: formData }) => {
    const parsedMode = thumbnailModeSchema.safeParse(formData.get('mode'));
    if (!parsedMode.success) return apiError('invalid_thumbnail_mode', 'Snapshot mode must be auto or manual.', 400);
    const revisionField = formData.get('expectedRevision');
    const parsedRevision = z.coerce.number().int().nonnegative().safeParse(revisionField);
    if (revisionField !== null && !parsedRevision.success) {
      return apiError('invalid_revision', 'Snapshot revision must be a non-negative integer.', 400);
    }
    const expectedRevision = revisionField !== null && parsedRevision.success ? parsedRevision.data : undefined;

    const current = await getDocument(session.user.id, projectId);
    if (parsedMode.data === 'auto' && (current.thumbnailMode === 'manual'
      || (expectedRevision !== undefined && current.revision !== expectedRevision))) {
      return Response.json({ project: current }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const asset = await uploadImageAsset({
      bytes: await readFile(file.path),
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
        expectedRevision,
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
    });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}
