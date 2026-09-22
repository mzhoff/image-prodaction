import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoryProject } from '../contracts/story-project';
import { testCharacter } from '../core/character-test-fixture';
import { createStorySnapshot, settingsForFormat } from '../core/story-presets';
import { characterGenerationPrompt } from '../core/character-passport';
import { generateStoryCharacter } from './character-generation';

function setup() {
  const story: StoryProject = { id: '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e92', name: 'Тестовая история', workspaceId: 'workspace', revision: 2, folderId: null, createdAt: '', updatedAt: '',
    snapshot: { ...createStorySnapshot(settingsForFormat('advert')), characters: [structuredClone(testCharacter)] } };
  type Dependencies = NonNullable<Parameters<typeof generateStoryCharacter>[3]>;
  let submissions = 0, admissions = 0;
  let submitted: Parameters<Dependencies['submit']>[0];
  let rows: Awaited<ReturnType<Dependencies['history']>> = [];
  const dependencies: Dependencies = {
    story: async (user) => { if (user !== 'owner') throw new Error('access denied'); return story; },
    credential: async () => { admissions++; return {} as Awaited<ReturnType<Dependencies['credential']>>; },
    model: async () => ({} as Awaited<ReturnType<Dependencies['model']>>),
    content: async () => { throw new Error('foreign asset denied'); },
    history: async () => rows,
    submit: async (input) => { submissions++; submitted = input; return { id: 'job', status: 'queued', finalAssetId: null } as Awaited<ReturnType<Dependencies['submit']>>; },
  };
  const input = { characterId: testCharacter.id, expectedRevision: 2, attemptId: '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e93', model: 'test/image' };
  return { story, input, dependencies, submissions: () => submissions, admissions: () => admissions, submitted: () => submitted,
    setRows: (next: typeof rows) => { rows = next; } };
}

test('the first image needs no input image and is compiled only from the saved passport', async () => {
  const fixture = setup();
  await generateStoryCharacter('owner', fixture.story.id, fixture.input, fixture.dependencies);
  const payload = fixture.submitted().payload as { prompt: string; referenceImages: unknown[]; storyCharacter: unknown };
  assert.equal(payload.prompt, characterGenerationPrompt(testCharacter.passport, ''));
  assert.deepEqual(payload.referenceImages, []);
  assert.deepEqual(payload.storyCharacter, { storyId: fixture.story.id, characterId: testCharacter.id, revision: 1 });
  assert.equal(fixture.submitted().documentId, null); assert.equal(fixture.submitted().metadata?.source, 'story-character');
  assert.equal(fixture.submissions(), 1);
});
test('a lost-response retry returns the queued operation after passport changes, without new admission', async () => {
  const fixture = setup();
  await generateStoryCharacter('owner', fixture.story.id, fixture.input, fixture.dependencies);
  fixture.setRows([{ id: 'job', idempotencyKey: fixture.submitted().idempotencyKey, enqueuedAt: new Date(), status: 'queued', finalAssetId: null } as Awaited<ReturnType<typeof fixture.dependencies.history>>[number]]);
  fixture.story.revision++;
  const replay = await generateStoryCharacter('owner', fixture.story.id, fixture.input, fixture.dependencies);
  assert.equal(replay.id, 'job'); assert.equal(fixture.submissions(), 1); assert.equal(fixture.admissions(), 1);
});
test('unauthorized, stale and inaccessible-reference requests never reach the generation queue', async () => {
  const fixture = setup();
  await assert.rejects(generateStoryCharacter('other', fixture.story.id, fixture.input, fixture.dependencies), /access denied/);
  await assert.rejects(generateStoryCharacter('owner', fixture.story.id, { ...fixture.input, expectedRevision: 1 }, fixture.dependencies), /актуальный паспорт/);
  fixture.story.snapshot.characters![0].references = ['0199c27a-54f4-7fa7-8b98-b7aa3f6f2e96'];
  await assert.rejects(generateStoryCharacter('owner', fixture.story.id, fixture.input, fixture.dependencies), /foreign asset denied/);
  assert.equal(fixture.submissions(), 0);
});
