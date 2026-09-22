import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { timelineSaveSchema, timelineWriteSchema } from '@/modules/story-projects/contracts/story-timeline';
import { createTimeline, getTimeline, listTimelines, saveTimeline } from '@/modules/story-projects/server/timeline-service';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { apiError } from '@/shared/api/api-error';
import { readBoundedJsonObject, JsonRequestError } from '@/shared/api/read-bounded-json';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function timelineRequest(request: Request, id?: string) {
  try {
    const session = await requireApiSession(request);
    if (id && !isUuid(id)) return apiError('invalid_timeline_id', 'Неверный адрес монтажа.', 400);
    if (request.method === 'GET' && id) return json({ timeline: await getTimeline(session.user.id, id) });
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!id && (!workspaceId || !isUuid(workspaceId))) return apiError('invalid_workspace_id', 'Выберите Workspace.', 400);
    if (request.method === 'GET') return json({ timelines: await listTimelines(session.user.id, workspaceId!) });
    const body = await readBoundedJsonObject(request, 2 * 1024 * 1024);
    if (id) {
      const parsed = timelineSaveSchema.safeParse(body);
      if (!parsed.success) return apiError('invalid_timeline', parsed.error.issues[0]?.message ?? 'Проверьте монтаж.', 422);
      const { expectedRevision, ...input } = parsed.data;
      return json({ timeline: await saveTimeline(session.user.id, id, expectedRevision, input) });
    }
    const parsed = timelineWriteSchema.extend({ creationId: z.uuid().optional() }).safeParse(body);
    if (!parsed.success) return apiError('invalid_timeline', parsed.error.issues[0]?.message ?? 'Проверьте монтаж.', 422);
    const { creationId, ...input } = parsed.data;
    return json({ timeline: await createTimeline(session.user.id, workspaceId!, input, undefined, creationId) }, 201);
  } catch (error) {
    if (error instanceof StoryError) return apiError(error.code, error.message, error.status);
    if (error instanceof JsonRequestError) return apiError('invalid_request', 'Не удалось прочитать монтаж. Максимальный размер — 2 МиБ.', error.status);
    return toApiErrorResponse(error);
  }
}
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
