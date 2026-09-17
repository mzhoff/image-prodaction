import { z } from 'zod';
import { getSubjectProfile, listSubjectProfiles, saveSubjectProfile, SubjectProfileError } from '@/entities/production-graph/server/subject-profile-service';
import { subjectProfileFields } from '@/entities/production-graph/model/subject-profile';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { readBoundedJsonObject, JsonRequestError } from '@/shared/api/read-bounded-json';
import { isUuidV7, isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

const bodySchema = z.object({ expectedRevision: z.number().int().min(0), fields: subjectProfileFields,
  sourceDocumentId: z.string().refine(isUuid).nullable().optional() }).strict();

export async function subjectRequest(request: Request, workspaceId: string, id?: string) {
  try {
    const session = await requireApiSession(request);
    if (!isUuid(workspaceId) || (id && !isUuidV7(id))) return apiError('invalid_id', 'Invalid subject or workspace.', 400);
    if (request.method === 'GET') return Response.json(id
      ? { subject: await getSubjectProfile(session.user.id, workspaceId, id) }
      : { subjects: await listSubjectProfiles(session.user.id, workspaceId) }, { headers: { 'Cache-Control': 'private, no-store' } });
    if (!id) return apiError('invalid_id', 'Subject id required.', 400);
    const parsed = bodySchema.safeParse(await readBoundedJsonObject(request, 256 * 1024));
    if (!parsed.success) return apiError('invalid_subject', 'Проверьте имя, поля паспорта и референсы (до 24 изображений).', 422);
    return Response.json({ subject: await saveSubjectProfile({ ...parsed.data, id, workspaceId, userId: session.user.id }) });
  } catch (error) {
    if (error instanceof SubjectProfileError) return apiError('subject_error', error.message, error.status);
    if (error instanceof JsonRequestError) return apiError('invalid_subject_body', 'Не удалось прочитать паспорт: некорректные данные или превышен лимит 256 КиБ.', error.status);
    return toApiErrorResponse(error);
  }
}
