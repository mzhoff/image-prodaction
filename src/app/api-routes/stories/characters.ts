import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { characterCommandSchema, characterGenerationSchema } from '@/modules/story-projects/contracts/story-character';
import { changeStoryCharacter } from '@/modules/story-projects/server/story-character-service';
import { generateStoryCharacter } from '@/modules/story-projects/server/character-generation';
import { characterGenerationRows, presentCharacterGeneration } from '@/modules/story-projects/server/character-generation-repository';
import { getStory, StoryError } from '@/modules/story-projects/server/story-service';
import { apiError } from '@/shared/api/api-error';
import { readBoundedJsonObject } from '@/shared/api/read-bounded-json';
import { isUuid } from '@/shared/lib/id';
import { toApiErrorResponse } from '../error-response';

export async function storyCharactersRequest(request: Request, storyId: string, generation = false) {
  try {
    const session = await requireApiSession(request);
    if (!isUuid(storyId)) return apiError('invalid_story_id', 'Неверный адрес истории.', 400);
    if (request.method === 'GET') {
      const story = await getStory(session.user.id, storyId);
      const generations = (await characterGenerationRows(story.workspaceId, storyId)).map(presentCharacterGeneration);
      return Response.json({ generations }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const body = await readBoundedJsonObject(request, 128 * 1024);
    if (generation) {
      const parsed = characterGenerationSchema.safeParse(body);
      if (!parsed.success) return apiError('invalid_character_generation', 'Проверьте параметры генерации героя.', 422);
      const job = await generateStoryCharacter(session.user.id, storyId, parsed.data);
      return Response.json({ job }, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
    }
    const parsed = characterCommandSchema.safeParse(body);
    if (!parsed.success) return apiError('invalid_character', parsed.error.issues[0]?.message ?? 'Проверьте паспорт героя.', 422);
    const story = await changeStoryCharacter(session.user.id, storyId, parsed.data);
    return Response.json({ story }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof StoryError) return apiError(error.code, error.message, error.status);
    return toApiErrorResponse(error);
  }
}
