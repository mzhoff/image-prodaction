import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchLibraryAssets } from '@/pages/library/api/library-api';
import { emptyLibraryFilters, writeLibraryFilters } from '@/pages/library/model/library-filters';
import { workspaceSearchMediaFilters } from './workspace-search-media';

test('changing search text preserves all Library media filters without mutating the source', () => {
  const saved = { folderId: 'project', origin: 'generated', mediaKind: 'video', modelId: 'model', documentId: 'flow', q: 'old' };
  const next = workspaceSearchMediaFilters('  promo  ', saved);
  assert.deepEqual(next, { ...saved, q: 'promo' });
  assert.equal(saved.q, 'old');
  assert.deepEqual(workspaceSearchMediaFilters(''), emptyLibraryFilters);
  assert.notEqual(writeLibraryFilters(next), writeLibraryFilters({ ...next, mediaKind: 'image' }));
});

test('initial and subsequent media requests carry the same constraints and workspace', async (t) => {
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(new URL(url, 'http://localhost'));
    return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
  });
  const filters = workspaceSearchMediaFilters('new query', { ...emptyLibraryFilters, folderId: 'folder', origin: 'uploaded',
    mediaKind: 'image', modelId: 'model', documentId: 'document', q: 'old query' });
  await fetchLibraryAssets('workspace', filters);
  await fetchLibraryAssets('workspace', filters, 'page-2');
  const expected = { workspaceId: 'workspace', folderId: 'folder', origin: 'uploaded', mediaKind: 'image',
    modelId: 'model', documentId: 'document', search: 'new query' };
  assert.deepEqual(Object.fromEntries(requests[0].searchParams), expected);
  assert.deepEqual(Object.fromEntries(requests[1].searchParams), { ...expected, cursor: 'page-2' });
});
