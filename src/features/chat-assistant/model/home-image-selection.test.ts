import assert from 'node:assert/strict';
import test from 'node:test';
import { createFallbackCatalog } from '@/shared/api/openrouter-models';
import { resolveHomeImageSelection } from './home-image-selection';

test('model changes preserve supported choices and replace unsupported parameters before submit', () => {
  const models = createFallbackCatalog().imageModels;
  const result = resolveHomeImageSelection({ model: 'google/gemini-2.5-flash-image', aspectRatio: '9:16', size: '4K' }, models);
  assert.equal(result.value.aspectRatio, '9:16');
  assert.equal(result.value.size, '1K');
  assert.equal(result.model?.id, result.value.model);
});
test('an automatic-only model cannot retain stale resolution or ratio', () => {
  const source = createFallbackCatalog().imageModels[0];
  const result = resolveHomeImageSelection({ model: source.id, aspectRatio: '9:16', size: '4K' }, [{ ...source, aspectRatios: [], sizes: [] }]);
  assert.deepEqual(result.value, { model: source.id, aspectRatio: 'auto', size: 'auto' });
});
test('a removed model resolves to an available model; an empty catalogue remains visibly unavailable', () => {
  const model = createFallbackCatalog().imageModels[1];
  const draft = { model: 'removed/model', aspectRatio: '1:1', size: '1K' };
  assert.equal(resolveHomeImageSelection(draft, [model]).value.model, model.id);
  assert.equal(resolveHomeImageSelection(draft, []).model, undefined);
});
