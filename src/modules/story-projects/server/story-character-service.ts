import { createUuidV7 } from '@/shared/lib/id';
import type { getSubjectProfile } from '@/entities/production-graph/server/subject-profile-service';
import type { StoryProject } from '../contracts/story-project';
import { characterCommandSchema, type CharacterCommand, type CharacterPassport, type StoryCharacter } from '../contracts/story-character';
import { characterFromLibrary, updateCharacterPassport } from '../core/character-passport';
import { getStory, saveStory, StoryError } from './story-service';

const profile: typeof getSubjectProfile = async (...args) => (await import('@/entities/production-graph/server/subject-profile-service')).getSubjectProfile(...args);
const defaults = { get: getStory, save: saveStory, profile, createId: createUuidV7 };
type Dependencies = Omit<typeof defaults, 'save'> & { save: (...args: Parameters<typeof saveStory>) => Promise<StoryProject> };

export function applyCharacterDrafts(characters: StoryCharacter[], drafts: { id: string | null; passport: CharacterPassport }[], createId = createUuidV7) {
  const next = [...characters];
  for (const draft of drafts) {
    if (draft.id) {
      const index = next.findIndex((character) => character.id === draft.id);
      if (index < 0) throw new StoryError('Герой не найден в истории.', 404, 'character_not_found');
      next[index] = updateCharacterPassport(next[index], draft.passport);
    } else next.push({ id: createId(), revision: 1, passport: draft.passport, references: [], previousPassports: [] });
  }
  if (next.length > 12) throw new StoryError('В истории может быть до 12 героев.', 422, 'character_limit');
  return next;
}

export async function changeStoryCharacter(userId: string, storyId: string, command: CharacterCommand, dependencies: Dependencies = defaults) {
  const input = characterCommandSchema.parse(command);
  const story = await dependencies.get(userId, storyId);
  if (story.revision !== input.expectedRevision) throw new StoryError('История обновилась. Откройте актуальную версию перед правкой героя.', 409, 'revision_conflict');
  let characters = story.snapshot.characters ?? [];
  if (input.action === 'save') characters = applyCharacterDrafts(characters, [input.character], dependencies.createId);
  if (input.action === 'import') {
    if (characters.some((character) => character.source?.subjectId === input.subjectId)) return story;
    if (characters.length >= 12) throw new StoryError('В истории может быть до 12 героев.', 422, 'character_limit');
    const subject = await dependencies.profile(userId, story.workspaceId, input.subjectId);
    if (subject.workspaceId !== story.workspaceId) throw new StoryError('Герой недоступен.', 404, 'character_not_found');
    characters = [...characters, characterFromLibrary(subject, dependencies.createId())];
  }
  if (input.action === 'reference' || input.action === 'undo') {
    if (!characters.some((character) => character.id === input.characterId)) throw new StoryError('Герой не найден.', 404, 'character_not_found');
    characters = characters.map((character) => {
      if (character.id !== input.characterId) return character;
      if (input.action === 'undo') {
        const passport = character.previousPassports.at(-1);
        return passport ? { ...character, passport, revision: character.revision + 1, previousPassports: character.previousPassports.slice(0, -1) } : character;
      }
      const references = [...new Set([...character.references, input.assetId])];
      if (references.length > 24) throw new StoryError('Для героя доступно до 24 референсов.', 422, 'reference_limit');
      return { ...character, references, ...(input.select ? { selectedReference: {
        assetId: input.assetId, approvedRevision: character.revision, visualStyle: story.snapshot.blueprint.visualStyle,
      } } : {}) };
    });
  }
  return dependencies.save(userId, storyId, input.expectedRevision, { name: story.name, folderId: story.folderId,
    snapshot: { ...story.snapshot, characters, ...(input.action === 'import' && story.snapshot.subjectIds ? { subjectIds: story.snapshot.subjectIds.filter((id) => id !== input.subjectId) } : {}), charactersSkipped: input.action === 'skip' ? input.skipped : false } });
}
