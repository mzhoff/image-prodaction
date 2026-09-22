import assert from 'node:assert/strict';
import test from 'node:test';
import { characterPassportSchema, storyCharacterSchema } from '../contracts/story-character';
import { characterGenerationPrompt, characterFromLibrary, characterPassportText, isCharacterReady, updateCharacterPassport } from './character-passport';
import { storySnapshotSchema } from '../contracts/story-project';
import { createStorySnapshot, settingsForFormat } from './story-presets';
import { assertStoryAssets } from '../server/story-service';

import { testPassport, testCharacter } from './character-test-fixture';

test('the same parsed passport drives human-readable and generation text without an independent prompt field', () => {
  const manual = characterPassportSchema.parse({ ...testPassport, temperament: ['kind'], silhouette: 'round' });
  const agent = characterPassportSchema.parse(JSON.parse(JSON.stringify(manual)));
  assert.equal(characterGenerationPrompt(manual, 'Мягкий свет'), characterGenerationPrompt(agent, 'Мягкий свет'));
  assert.match(characterPassportText(manual), /Добрый/); assert.match(characterPassportText(manual), /Округлый/);
  assert.match(characterGenerationPrompt(manual, 'Мягкий свет'), /Обязательно сохранять: Белый кончик хвоста/);
  assert.equal(characterPassportSchema.safeParse({ ...testPassport, prompt: 'hidden override' }).success, false);
});
test('accepted references become stale after an edit or story style change; previous variants survive', () => {
  const assetId = '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e91';
  const ready = { ...testCharacter, references: [assetId], selectedReference: { assetId, approvedRevision: 1, visualStyle: 'Бумага' } };
  assert.equal(isCharacterReady(ready, 'Бумага'), true); assert.equal(isCharacterReady(ready, 'Глина'), false);
  const edited = updateCharacterPassport(ready, { ...testPassport, temperament: ['kind'] });
  assert.equal(isCharacterReady(edited, 'Бумага'), false); assert.deepEqual(edited.references, [assetId]);
  assert.deepEqual(edited.previousPassports, [testPassport]); assert.equal(ready.passport.temperament[0], 'playful');
});
test('legacy stories remain valid; duplicate characters and dangling/foreign references are rejected', () => {
  const snapshot = createStorySnapshot(settingsForFormat('advert'));
  assert.equal(storySnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(storySnapshotSchema.safeParse({ ...snapshot, characters: [testCharacter, testCharacter] }).success, false);
  const assetId = '0199c27a-54f4-7fa7-8b98-b7aa3f6f2e91';
  assert.equal(storyCharacterSchema.safeParse({ ...testCharacter, selectedReference: { assetId, approvedRevision: 1, visualStyle: '' } }).success, false);
  assert.throws(() => assertStoryAssets({ ...snapshot, characters: [{ ...testCharacter, references: [assetId] }] }, []), /Материал недоступен/);
});

test('Library import retains long descriptions, immutable details and notes without silent truncation', () => {
  const profile = { id: testCharacter.id, revision: 3, name: 'Герой', subjectType: 'character',
    identitySummary: 'А'.repeat(10_000), immutableTraits: Array.from({ length: 20 }, (_, index) => `Примета ${index}`).join('\n'),
    mutableAttributes: 'Б'.repeat(10_000), negativeConstraints: 'В'.repeat(10_000), notes: 'Г'.repeat(10_000), imageAssetIds: [] };
  const character = storyCharacterSchema.parse(characterFromLibrary(profile, testCharacter.id));
  assert.equal(character.passport.identity, profile.identitySummary);
  assert.equal(character.passport.details, profile.mutableAttributes);
  assert.equal(character.passport.notes, profile.notes);
  const prompt = characterGenerationPrompt(character.passport, '');
  for (const value of [profile.identitySummary, profile.mutableAttributes, profile.negativeConstraints, profile.notes]) assert.ok(prompt.includes(value));
  for (let index = 0; index < 20; index++) assert.ok(prompt.includes(`Примета ${index}`));
});
