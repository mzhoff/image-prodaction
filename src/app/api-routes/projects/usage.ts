import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { getDocumentUsage } from '@/modules/usage/server/document-usage-service';
import { apiError } from '@/shared/api/api-error';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function getProjectUsage(request: Request, projectId: string) {
  try {
    const session = await requireApiSession(request);
    if (!isUuid(projectId)) return apiError('invalid_document_id', 'Некорректный документ.', 400);
    return Response.json(await getDocumentUsage(session.user.id, projectId), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
