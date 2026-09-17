import assert from 'node:assert/strict';
import test from 'node:test';
import { applyModelPreferenceChange as apply, emptyAccountModelPreferences, ModelPreferenceConflict, selectModels } from './contracts';
const options = [
  { value: 'p/z', label: 'Zebra' }, { value: 'p/a', label: 'alpha' }, { value: 'p/b', label: 'Beta' },
  { value: 'openrouter/auto', label: 'Auto Router' },
];
test('All is strictly alphabetical, never auto-routed or reordered by favorites/popularity', () => {
  assert.deepEqual(selectModels(options, 'all', ['p/z'], { 'p/z': 100 }).map((m) => m.value), ['p/a', 'p/b', 'p/z']);
});
test('popular models require usage; ties use names; search preserves favorite and popularity order', () => {
  assert.deepEqual(selectModels(options, 'popular', [], { 'p/z': 5, 'p/b': 5 }).map((m) => m.value), ['p/b', 'p/z']);
  assert.deepEqual(selectModels(options, 'popular', [], {}), []);
  assert.deepEqual(selectModels(options, 'favorites', ['p/z', 'p/b', 'p/a'], {}, 'a').map((m) => m.value), ['p/z', 'p/b', 'p/a']);
  assert.equal(selectModels(options, 'all', [], {}, 'BETA')[0].value, 'p/b');
});
test('explicit favorites are retry-safe; re-add appends, reorder preserves the set and detects stale edits', () => {
  let p = emptyAccountModelPreferences('a').preferences.image;
  const change = (modelId: string, favorite = true) => ({ modality: 'image' as const, action: 'favorite' as const, modelId, favorite });
  p = apply(p, change('p/z')); p = apply(p, change('p/a')); p = apply(p, change('p/z'));
  assert.deepEqual(p.favorites, ['p/z', 'p/a']);
  p = apply(p, change('p/z', false)); p = apply(p, change('p/z'));
  assert.deepEqual(p.favorites, ['p/a', 'p/z']);
  p = apply(p, { modality: 'image', action: 'reorder', favorites: ['p/z', 'p/a'], expectedRevision: 0 });
  assert.deepEqual(p.favorites, ['p/z', 'p/a']);
  assert.throws(() => apply(p, { modality: 'image', action: 'reorder', favorites: ['p/a'], expectedRevision: 0 }), ModelPreferenceConflict);
  assert.throws(() => apply(p, { modality: 'image', action: 'reorder', favorites: p.favorites, expectedRevision: 1 }), ModelPreferenceConflict);
});
test('defaults are independent by modality and account', () => {
  const a = emptyAccountModelPreferences('a'), b = emptyAccountModelPreferences('b');
  a.preferences.video = apply(a.preferences.video, { modality: 'video', action: 'tab', tab: 'popular' });
  a.preferences.image.favorites.push('p/image');
  assert.equal(a.preferences.image.tab, 'all'); assert.equal(b.preferences.video.tab, 'all');
  assert.deepEqual(a.preferences.audio.favorites, []); assert.deepEqual(b.preferences.image.favorites, []);
});
