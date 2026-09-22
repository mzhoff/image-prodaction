import assert from 'node:assert/strict';
import test from 'node:test';
import { commitHomeLibrarySelection, toggleHomeLibrarySelection } from './home-library-selection';
import type { HomeLibraryReference } from '../api/home-library-reference-api';

const items: HomeLibraryReference[] = ['a', 'b', 'c'].map((id) => ({ id, originalName: `${id}.png`, byteSize: 10, contentType: 'image/png' }));

test('draft selection respects remaining slots, permits deselection at the limit and rejects oversized files', () => {
  let selected = toggleHomeLibrarySelection([], items[0], 2);
  selected = toggleHomeLibrarySelection(selected, items[1], 2);
  assert.equal(toggleHomeLibrarySelection(selected, items[2], 2), selected);
  selected = toggleHomeLibrarySelection(selected, items[0], 2);
  assert.deepEqual(selected, [items[1]]);
  assert.equal(toggleHomeLibrarySelection(selected, { ...items[2], byteSize: 9 * 1024 * 1024 }, 2), selected);
  assert.deepEqual(toggleHomeLibrarySelection([], items[0], 0), []);
});

test('Add commits a single ordered batch only after every selected image has downloaded', async () => {
  const batches: File[][] = [];
  const load = async (item: HomeLibraryReference) => new File(['image'], item.originalName);
  await commitHomeLibrarySelection(items.slice(0, 2), 2, new AbortController().signal, async (files) => { batches.push(files); }, load);
  assert.deepEqual(batches.map((batch) => batch.map((file) => file.name)), [['a.png', 'b.png']]);
});

test('download failures, cancellation and limits never partially add references', async () => {
  let commits = 0;
  const commit = async () => { commits++; };
  const controller = new AbortController();
  await assert.rejects(commitHomeLibrarySelection(items, 2, controller.signal, commit), /количество/);
  await assert.rejects(commitHomeLibrarySelection([], 2, controller.signal, commit), /количество/);
  await assert.rejects(commitHomeLibrarySelection(items, 3, controller.signal, commit, async (item) => {
    if (item.id === 'b') throw new Error('Unavailable');
    return new File(['image'], item.originalName);
  }), /Unavailable/);
  await commitHomeLibrarySelection(items, 3, controller.signal, commit, async (item) => {
    controller.abort(); return new File(['image'], item.originalName);
  });
  assert.equal(commits, 0);
});
