import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_IMAGE_MODEL } from '@/shared/api/openrouter-models';
import { getEditDefaultModel } from '../lib/image-viewer-edit-model';

test('the edit model defaults to the model recorded on the selected result', () => {
  assert.equal(getEditDefaultModel('provider/legacy-image-model'), 'provider/legacy-image-model');
});

test('the edit model falls back only when the result has no model metadata', () => {
  assert.equal(getEditDefaultModel(), DEFAULT_IMAGE_MODEL);
});
