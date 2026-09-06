import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '../model/create-default-node';
import { getIncomingImageInputs } from '../model/graph-incoming-inputs';
import { initialProject } from '../model/initial-project';
import { createNodeTemplateSnapshot, getNodeTemplateAssetIds } from '../model/node-template-preset';
import { createEmptyProjectUiState } from '../model/project-schema';
import { useProductionGraphStore } from '../model/use-production-graph-store';
import { hydrateNodeTemplateAssets } from './node-template-assets';

const workspaceId = '01a00000-0000-7000-8000-000000000010';
const assetIds = [1, 2, 3, 4, 5].map((value) => `01a00000-0000-7000-8000-00000000000${value}`);
const metadata = (id: string, overrides = {}) => ({ id, workspaceId, status: 'ready', mediaKind: 'image',
  originalName: 'Saved image.webp', contentType: 'image/webp', createdAt: '2026-09-06T00:00:00.000Z',
  width: 1024, height: 768, ...overrides });

test('audio template assets hydrate with server-validated metadata in the same workspace', async () => {
  const node = createDefaultNode('importImage', { x: 0, y: 0 });
  const snapshot = createNodeTemplateSnapshot({ ...node, data: { title: 'Audio', mediaKind: 'audio', assetId: assetIds[0] } });
  const hydrated = await hydrateNodeTemplateAssets(snapshot, workspaceId, undefined, async () => Response.json({ asset: metadata(assetIds[0], {
    mediaKind: 'audio', contentType: 'audio/wav', originalName: 'Audio.wav', width: null, height: null,
    audio: { container: 'wav', codec: 'pcm_s16le', contentType: 'audio/wav', durationSeconds: 2, sampleRateHz: 24000, channels: 1 },
  }) }));
  assert.equal(hydrated.assets[0].kind, 'audio');
  assert.equal(hydrated.assets[0].audio?.durationSeconds, 2);
  assert.deepEqual(getNodeTemplateAssetIds(hydrated.snapshot), [assetIds[0]]);
});

function imageSnapshot(ids = [assetIds[0]]) {
  const node = createDefaultNode('generateImage', { x: 0, y: 0 });
  return createNodeTemplateSnapshot({ ...node,
    data: { ...node.data, resultAssetId: ids[0], resultAssetIds: ids } });
}

test('template insertion into another document hydrates image records atomically and supports undo/redo', async () => {
  const hydrated = await hydrateNodeTemplateAssets(imageSnapshot(), workspaceId, undefined, async (url, init) => {
    assert.equal(url, `/api/assets/${assetIds[0]}`);
    assert.equal(init.cache, 'no-store');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).has('Authorization'), false);
    return Response.json({ asset: metadata(assetIds[0]) });
  });
  const store = useProductionGraphStore;
  store.setState({ ...structuredClone(initialProject), uiState: createEmptyProjectUiState(), historyPast: [], historyFuture: [] });
  const nodeId = store.getState().addNodeFromFavorite(hydrated.snapshot, { x: 0, y: 0 }, hydrated.assets);
  const inserted = store.getState();
  assert.equal(inserted.nodes.length, 1);
  assert.deepEqual(inserted.assets[0].storage, { type: 'remote', assetId: assetIds[0] });
  const downstream = createDefaultNode('exportImage', { x: 400, y: 0 });
  const inputs = getIncomingImageInputs(downstream.id, 'image-0', {
    nodes: [...inserted.nodes, downstream], assets: inserted.assets,
    edges: [{ id: 'connection', sourceNodeId: nodeId, sourcePortId: 'image', targetNodeId: downstream.id, targetPortId: 'image-0' }],
  });
  assert.equal(inputs[0]?.asset.id, assetIds[0]);
  assert.equal(inserted.historyPast.length, 1);
  store.getState().undo();
  assert.equal(store.getState().nodes.length, 0);
  assert.equal(store.getState().assets.length, 0);
  store.getState().redo();
  assert.equal(store.getState().nodes[0].id, nodeId);
  assert.equal(store.getState().assets[0].id, assetIds[0]);
});

test('template apply strips foreign, forbidden, missing and not-ready image references', async () => {
  const hydrated = await hydrateNodeTemplateAssets(imageSnapshot(assetIds), workspaceId, undefined, async (url) => {
    const id = url.split('/').at(-1)!;
    if (id === assetIds[2]) return new Response(null, { status: 403 });
    if (id === assetIds[3]) return new Response(null, { status: 404 });
    return Response.json({ asset: metadata(id, id === assetIds[1] ? { workspaceId: 'another-workspace' }
      : id === assetIds[4] ? { status: 'pending' } : {}) });
  });
  assert.deepEqual(hydrated.assets.map((asset) => asset.id), [assetIds[0]]);
  assert.deepEqual(getNodeTemplateAssetIds(hydrated.snapshot), [assetIds[0]]);
  assert.equal(hydrated.strippedAssetReferenceCount, 4);
});

test('temporary errors and expired sessions do not turn valid templates into partial empty nodes', async () => {
  for (const status of [401, 429, 503]) {
    await assert.rejects(() => hydrateNodeTemplateAssets(imageSnapshot(), workspaceId, undefined,
      async () => new Response(null, { status })), /Could not load template images/);
  }
  await assert.rejects(() => hydrateNodeTemplateAssets(imageSnapshot(), workspaceId, undefined,
    async () => Response.json({ asset: {} })), /metadata response is invalid/);
});

test('canceling a pending document insertion discards already received metadata', async () => {
  const controller = new AbortController();
  await assert.rejects(() => hydrateNodeTemplateAssets(imageSnapshot(), workspaceId, controller.signal, async (_url, init) => {
    assert.equal(init.signal, controller.signal);
    controller.abort();
    return Response.json({ asset: metadata(assetIds[0]) });
  }), { name: 'AbortError' });
});
