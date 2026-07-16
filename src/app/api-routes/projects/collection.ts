import { z } from 'zod';
import { createDocument, listDocuments } from '@/entities/document/server/document-service';
import { ensurePersonalWorkspace } from '@/entities/workspace/server/workspace-service';
import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/shared/auth/session';
import { isUuidV7 } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

const createDocumentBody = z.object({
  workspaceId: z.string().refine(isUuidV7, 'workspaceId must be UUIDv7'),
  name: z.string().trim().max(120).optional(),
});

export async function getProjects(request: Request) {
  try {
    const session = await requireApiSession(request);
    await ensurePersonalWorkspace(session.user);
    return Response.json({ projects: await listDocuments(session.user.id) });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function postProject(request: Request) {
  try {
    const session = await requireApiSession(request);
    const parsed = createDocumentBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError('invalid_request', 'A valid workspaceId and name are required.', 400);
    const project = await createDocument({ ...parsed.data, userId: session.user.id });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
