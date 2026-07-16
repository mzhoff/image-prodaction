import { z } from 'zod';
import { cleanupDocumentAssets } from '@/entities/asset/server/asset-service';
import {
  DocumentConflictError,
  getDocument,
  permanentlyDeleteDocument,
  saveDocumentSnapshot,
  updateDocumentMetadata,
} from '@/entities/document/server/document-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toAssetApiErrorResponse } from '../assets/error-response';
import { toApiErrorResponse } from '../error-response';

const documentIdSchema = z.string().refine(isUuidV7);
const updateDocumentBody = z.object({
  name: z.string().trim().max(120).optional(),
  favorite: z.boolean().optional(),
  status: z.enum(['active', 'trash']).optional(),
  snapshot: z.unknown().optional(),
  expectedRevision: z.number().int().min(0).optional(),
}).refine(
  (body) => body.snapshot === undefined || body.expectedRevision !== undefined,
  'expectedRevision is required with snapshot',
);

export async function getProject(request: Request, projectId: string) {
  try {
    if (!documentIdSchema.safeParse(projectId).success) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    return Response.json({ project: await getDocument(session.user.id, projectId) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function patchProject(request: Request, projectId: string) {
  try {
    if (!documentIdSchema.safeParse(projectId).success) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    const parsed = updateDocumentBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError('invalid_request', 'The project update is invalid.', 400);

    const { snapshot, expectedRevision, ...metadata } = parsed.data;
    if (snapshot !== undefined && expectedRevision !== undefined) {
      const project = await saveDocumentSnapshot({
        documentId: projectId,
        userId: session.user.id,
        expectedRevision,
        snapshot,
      });
      return Response.json({ project });
    }

    return Response.json({
      project: await updateDocumentMetadata({ ...metadata, documentId: projectId, userId: session.user.id }),
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function deleteProject(request: Request, projectId: string) {
  try {
    if (!documentIdSchema.safeParse(projectId).success) return apiError('invalid_project_id', 'Invalid project id.', 400);
    const session = await requireApiSession(request);
    const project = await getDocument(session.user.id, projectId);
    if (project.status !== 'trash') throw new DocumentConflictError(project.revision);
    await cleanupDocumentAssets(projectId);
    await permanentlyDeleteDocument(session.user.id, projectId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toAssetApiErrorResponse(error);
  }
}
