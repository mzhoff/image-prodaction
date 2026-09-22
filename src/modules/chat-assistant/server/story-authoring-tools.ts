import { createUuidV7 } from '@/shared/lib/id';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import type { ToolCallRequest, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { getStory, saveStory, StoryError } from '@/modules/story-projects/server/story-service';
import type { verifiedStoryContext } from './story-conversation';
import { applyCharacterDrafts } from '@/modules/story-projects/server/story-character-service';
import { STORY_BLUEPRINT_PRESENTATION, STORY_WRITING_TOOLS, STORY_CHARACTERS_TOOL, STORY_QUESTION_TOOL, STORY_SCENES_TOOL, storyCharactersInputSchema, storyScenesInputSchema, storyBlueprintInputSchema, storyQuestionSchema } from '../contracts/story-authoring';

const verify: typeof verifiedStoryContext = async (...args) => (await import('./story-conversation')).verifiedStoryContext(...args);
const defaultDependencies = { verify, get: getStory, save: saveStory };
type Dependencies = { verify: typeof verify; get: typeof getStory; save: (...args: Parameters<typeof saveStory>) => Promise<StoryProject> };

export async function prepareStoryBlueprint(request: ToolCallRequest, context: ToolExecutionContext, dependencies: Dependencies = defaultDependencies) {
  if (!STORY_WRITING_TOOLS.includes(request.toolName) || request.riskLevel !== 'write') throw new Error('Недопустимое действие с историей.');
  const scenes = request.toolName === STORY_SCENES_TOOL;
  const input = (request.toolName === STORY_CHARACTERS_TOOL ? storyCharactersInputSchema : scenes ? storyScenesInputSchema : storyBlueprintInputSchema).parse(request.input);
  const story = await dependencies.verify(context, context.conversationId);
  if (!story || context.verifiedContext?.storyAuthoringRevision !== input.expectedRevision || story.revision !== input.expectedRevision) {
    throw new Error('История изменилась. Сохраните или обновите документ перед продолжением.');
  }
  if (scenes && (story.scenes.length || !story.blueprint.script?.trim())) throw new Error('Для первой раскадровки нужен сохранённый blueprint и пустой список сцен.');
  return {
    executionRef: `${request.toolName}:${story.id}:${input.expectedRevision}`, concurrencyToken: String(input.expectedRevision),
    presentationType: STORY_BLUEPRINT_PRESENTATION,
    safePreview: { storyId: story.id, submitAuthorized: true, ...input },
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
}

export async function callStoryTool(request: ToolCallRequest, context: ToolExecutionContext, dependencies: Dependencies = defaultDependencies) {
  const bound = await dependencies.verify(context, context.conversationId);
  if (!bound) return { ok: false, safeError: { code: 'STORY_REQUIRED', message: 'Откройте историю, чтобы продолжить.', retryable: false } };
  if (request.toolName === STORY_QUESTION_TOOL) {
    const question = storyQuestionSchema.safeParse(request.input);
    return question.success ? { ok: true, output: { action: 'story-question', interactionId: context.toolCallId, ...question.data } }
      : { ok: false, safeError: { code: 'INVALID_STORY_QUESTION', message: 'Нужен один вопрос и два варианта ответа.', retryable: true } };
  }
  if (!STORY_WRITING_TOOLS.includes(request.toolName)) return { ok: false, safeError: { code: 'STORY_TOOL_UNAVAILABLE', message: 'Этот инструмент недоступен в истории.', retryable: false } };
  const scenesInput = request.toolName === STORY_SCENES_TOOL ? storyScenesInputSchema.safeParse(request.input) : undefined;
  const parsed = (request.toolName === STORY_CHARACTERS_TOOL ? storyCharactersInputSchema : request.toolName === STORY_SCENES_TOOL ? storyScenesInputSchema : storyBlueprintInputSchema).safeParse(request.input);
  if (!parsed.success || request.riskLevel !== 'write' || request.executionRef !== `${request.toolName}:${bound.id}:${parsed.data.expectedRevision}`) {
    return { ok: false, safeError: { code: 'INVALID_STORY_BLUEPRINT', message: 'Не удалось проверить подготовленный blueprint.', retryable: false } };
  }
  try {
    const current = await dependencies.get(context.userId, bound.id);
    const expectedRevision = parsed.data.expectedRevision;
    if (request.toolName === STORY_CHARACTERS_TOOL) {
      const { characters: drafts } = storyCharactersInputSchema.parse(request.input);
      const existing = current.snapshot.characters ?? [];
      const repeated = current.revision === expectedRevision + 1 && drafts.every((draft) => existing.some((character) =>
        (!draft.id || character.id === draft.id) && JSON.stringify(character.passport) === JSON.stringify(draft.passport)));
      const characters = repeated ? existing : applyCharacterDrafts(existing, drafts);
      const story = repeated ? current : await dependencies.save(context.userId, bound.id, expectedRevision, {
        name: current.name, folderId: current.folderId, snapshot: { ...current.snapshot, characters, charactersSkipped: false },
      });
      return { ok: true, output: { action: 'story-characters-saved', storyId: story.id, revision: story.revision, summary: 'Паспорта героев сохранены' } };
    }
    if (scenesInput?.success) {
      if (!current.snapshot.blueprint.script.trim()) throw new StoryError('Сначала сохраните blueprint.', 409, 'blueprint_required');
      const existing = current.snapshot.scenes.map((scene) => ({ title: scene.title, description: scene.description, shots: scene.shots.map((shot) => ({ description: shot.description, durationMs: shot.durationMs })) }));
      if (current.revision === expectedRevision + 1 && JSON.stringify(existing) === JSON.stringify(scenesInput.data.scenes)) {
        return { ok: true, output: { action: 'story-scenes-saved', storyId: current.id, revision: current.revision, summary: 'Раскадровка сохранена' } };
      }
      if (current.snapshot.scenes.length) throw new StoryError('В истории уже есть сцены. Их можно доработать в раскадровке.', 409, 'story_scenes_exist');
      const scenes = scenesInput.data.scenes.map((scene) => ({ ...scene, id: createUuidV7(), shots: scene.shots.map((shot) => ({ ...shot, id: createUuidV7(), imageAssetId: null, videoAssetId: null })) }));
      const story = await dependencies.save(context.userId, bound.id, expectedRevision, { name: current.name, folderId: current.folderId, snapshot: { ...current.snapshot, scenes } });
      return { ok: true, output: { action: 'story-scenes-saved', storyId: story.id, revision: story.revision, summary: 'Раскадровка сохранена' } };
    }
    const { blueprint } = storyBlueprintInputSchema.parse(request.input);
    // Retry after a lost response must not create another revision or overwrite newer work.
    const alreadySaved = current.revision === expectedRevision + 1
      && Object.entries(blueprint).every(([key, value]) => current.snapshot.blueprint[key as keyof typeof blueprint] === value);
    const story = alreadySaved ? current : await dependencies.save(context.userId, bound.id, expectedRevision, {
      name: current.name, folderId: current.folderId, snapshot: { ...current.snapshot, blueprint },
    });
    return { ok: true, output: { action: 'story-blueprint-saved', storyId: story.id, revision: story.revision, summary: 'Blueprint сохранён' } };
  } catch (error) {
    if (!(error instanceof StoryError)) throw error;
    return { ok: false, safeError: { code: error.code, message: error.message, retryable: false } };
  }
}
