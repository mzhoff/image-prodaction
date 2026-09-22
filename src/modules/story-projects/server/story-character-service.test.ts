import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoryProject } from '../contracts/story-project';
import { createStorySnapshot, settingsForFormat } from '../core/story-presets';
import { testCharacter, testPassport } from '../core/character-test-fixture';
import { changeStoryCharacter } from './story-character-service';
import { StoryError } from './story-service';
import { emptySubjectProfile, buildLibrarySubject } from '@/entities/production-graph/model/subject-profile';

const subject = buildLibrarySubject({ ...emptySubjectProfile, name: 'Лиса', identitySummary: 'Друг героя', immutableTraits: 'Белый хвост' },
  { id: '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e94', workspaceId: 'workspace', revision: 4, sourceDocumentId: null, createdAt: '', updatedAt: '' });
function setup() {
  let story: StoryProject = { id: 'story', workspaceId: 'workspace', folderId: null, name: 'Тест', revision: 0, createdAt: '', updatedAt: '',
    snapshot: { ...createStorySnapshot(settingsForFormat('advert')), characters: [structuredClone(testCharacter)] } };
  let writes = 0;
  const deps: NonNullable<Parameters<typeof changeStoryCharacter>[3]> = {
    get: async (user) => { if (user !== 'owner') throw new StoryError('История недоступна', 404, 'story_not_found'); return structuredClone(story); },
    save: async (_user, _id, revision, input) => { if (revision !== story.revision) throw new StoryError('Конфликт', 409, 'revision_conflict'); writes++; story = { ...story, ...input, revision: revision + 1 }; return structuredClone(story); },
    profile: async (_user, workspace) => { assert.equal(workspace, subject.workspaceId); return subject; },
    createId: () => '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e95',
  };
  return { deps, current: () => story, writes: () => writes };
}
test('manual edits use CAS, can be undone, and never alter an imported Library master', async () => {
  const fixture = setup(); const original = structuredClone(subject);
  await changeStoryCharacter('owner', 'story', { action: 'import', subjectId: subject.id, expectedRevision: 0 }, fixture.deps);
  const imported = fixture.current().snapshot.characters!.at(-1)!;
  assert.deepEqual(imported.source, { subjectId: subject.id, revision: 4 });
  await changeStoryCharacter('owner', 'story', { action: 'save', expectedRevision: 1, character: { id: imported.id, passport: { ...imported.passport, temperament: ['kind'] } } }, fixture.deps);
  assert.deepEqual(subject, original);
  await assert.rejects(changeStoryCharacter('owner', 'story', { action: 'save', expectedRevision: 1, character: { id: imported.id, passport: testPassport } }, fixture.deps), /обновилась/);
  await changeStoryCharacter('owner', 'story', { action: 'undo', expectedRevision: 2, characterId: imported.id }, fixture.deps);
  assert.deepEqual(fixture.current().snapshot.characters!.at(-1)!.passport, imported.passport);
});
test('unbound users and unknown character ids cannot modify a story', async () => {
  const fixture = setup();
  await assert.rejects(changeStoryCharacter('other', 'story', { action: 'skip', expectedRevision: 0, skipped: true }, fixture.deps), /недоступна/);
  await assert.rejects(changeStoryCharacter('owner', 'story', { action: 'save', expectedRevision: 0, character: { id: subject.id, passport: testPassport } }, fixture.deps), /не найден/);
  assert.equal(fixture.writes(), 0);
});
