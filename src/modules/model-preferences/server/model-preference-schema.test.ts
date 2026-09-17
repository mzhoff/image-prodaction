import assert from 'node:assert/strict';
import test from 'node:test';
import { modelPreferenceChangeSchema as schema } from './model-preference-schema';
test('API accepts only account preference actions, not client-selected users/workspaces or Auto Router', () => {
  const action = { modality: 'image', action: 'favorite', modelId: 'openai/gpt-image-2.5-flare', favorite: true };
  assert.equal(schema.safeParse(action).success, true);
  for (const body of [{ ...action, userId: 'other' }, { ...action, workspaceId: 'other' }, { ...action, modelId: 'openrouter/auto' },
    { ...action, favorite: 'yes' }, { ...action, modality: 'other' }, { modality: 'text', action: 'reorder', favorites: ['a/a', 'a/a'], expectedRevision: 1 }]) {
    assert.equal(schema.safeParse(body).success, false);
  }
});
