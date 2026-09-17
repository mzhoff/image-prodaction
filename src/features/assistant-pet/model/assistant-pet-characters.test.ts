import assert from 'node:assert/strict';
import test from 'node:test';
import { ASSISTANT_PET_CHARACTERS, findAssistantPetCharacter } from './assistant-pet-characters';

test('the first pet has a resilient fallback visual for every launcher', () => {
  const rover = findAssistantPetCharacter('rover');
  assert.equal(rover.id, 'rover');
  assert.match(rover.fallbackImageUrl, /^\/characters\/assistant-pet\/v1\/.+\.svg$/);
  assert.equal(rover.renderKind, 'rover-v1');
  assert.equal(ASSISTANT_PET_CHARACTERS.length, 1);
});

test('an unavailable selected character falls back to the first shipped pet', () => {
  assert.equal(findAssistantPetCharacter('missing-character').id, 'rover');
});
