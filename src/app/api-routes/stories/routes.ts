import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { storySaveSchema, storyWriteSchema } from '@/modules/story-projects/contracts/story-project';
import { createStory, getStory, listStories, saveStory, StoryError } from '@/modules/story-projects/server/story-service';
import { apiError } from '@/shared/api/api-error';
import { readBoundedJsonObject, JsonRequestError } from '@/shared/api/read-bounded-json';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function storiesRequest(request: Request, storyId?: string) {
  try {
    const session = await requireApiSession(request);
    if (storyId && !isUuid(storyId)) return apiError('invalid_story_id', 'Неверный адрес истории.', 400);
    if (request.method === 'GET' && storyId) return json({ story: await getStory(session.user.id, storyId) });
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!storyId && (!workspaceId || !isUuid(workspaceId))) return apiError('invalid_workspace_id', 'Выберите Workspace.', 400);
    if (request.method === 'GET') return json({ stories: await listStories(session.user.id, workspaceId!) });
    const body = await readBoundedJsonObject(request, 2 * 1024 * 1024);
    if (storyId) {
      const parsed = storySaveSchema.safeParse(body);
      if (!parsed.success) return apiError('invalid_story', parsed.error.issues[0]?.message ?? 'Проверьте историю.', 422);
      const { expectedRevision, ...input } = parsed.data;
      return json({ story: await saveStory(session.user.id, storyId, expectedRevision, input) });
    }
    const parsed = storyWriteSchema.extend({ creationId: z.uuid().optional() }).safeParse(body);
    if (!parsed.success) return apiError('invalid_story', parsed.error.issues[0]?.message ?? 'Проверьте историю.', 422);
    const { creationId, ...input } = parsed.data;
    return json({ story: await createStory(session.user.id, workspaceId!, input, undefined, creationId) }, 201);
  } catch (error) {
    if (error instanceof StoryError) return apiError(error.code, error.message, error.status);
    if (error instanceof JsonRequestError) return apiError('invalid_story_request', 'Не удалось прочитать историю. Максимальный размер — 2 МиБ.', error.status);
    return toApiErrorResponse(error);
  }
}
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
