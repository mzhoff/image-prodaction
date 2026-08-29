import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFavoriteNodeSnapshot,
  createNodeFromFavoriteSnapshot,
  filterFavoriteNodeAssetIds,
  getFavoriteNodeAssetIds,
} from './favorite-node-preset';
import { createDefaultNode } from './create-default-node';
import type { CompositionNodeData, ProductionNode } from './types';

test('favorite snapshot retains reusable configuration and removes transient or secret data', () => {
  const node = createDefaultNode('textGeneration', { x: 120, y: 240 });
  const source = {
    ...node,
    id: 'node-original',
    locked: true,
    status: 'error' as const,
    data: {
      ...node.data,
      instruction: 'Turn notes into a concise post.',
      message: 'Provider request failed.',
      model: 'openai/gpt-5.4-nano',
      prompt: 'Stable prompt',
      result: 'Saved result',
      generationRequest: { fingerprint: 'runtime', idempotencyKey: 'secret' },
      items: [{ sourceNodeId: 'node-original', status: 'running', text: 'Reusable item' }],
      apiKey: 'must-never-be-stored',
      previewUrl: 'blob:http://localhost/private',
    },
  } as unknown as ProductionNode;

  const snapshot = createFavoriteNodeSnapshot(source);
  const data = snapshot.data as unknown as Record<string, unknown>;
  assert.equal(snapshot.nodeType, 'textGeneration');
  assert.equal(data.instruction, 'Turn notes into a concise post.');
  assert.equal(data.model, 'openai/gpt-5.4-nano');
  assert.equal(data.result, 'Saved result');
  assert.equal(data.message, undefined);
  assert.equal(data.generationRequest, undefined);
  assert.equal(data.apiKey, undefined);
  assert.equal(data.previewUrl, undefined);
  assert.deepEqual(data.items, [{ text: 'Reusable item' }]);
  assert.equal('id' in snapshot, false);
  assert.equal('edges' in snapshot, false);
});

test('favorite reconstruction creates a fresh idle unlocked node without original graph identity', () => {
  const source = createDefaultNode('textPrompt', { x: 1, y: 2 });
  const snapshot = createFavoriteNodeSnapshot({
    ...source,
    data: { ...source.data, text: 'Reusable notes', result: 'Reusable result' },
  });

  const first = createNodeFromFavoriteSnapshot(snapshot, { x: 400, y: 500 });
  const second = createNodeFromFavoriteSnapshot(snapshot, { x: 700, y: 800 });
  assert.notEqual(first.id, source.id);
  assert.notEqual(second.id, source.id);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(first.position, { x: 400, y: 500 });
  assert.deepEqual(second.position, { x: 700, y: 800 });
  assert.equal(first.status, 'idle');
  assert.equal(first.locked, false);
  assert.equal((first.data as { text: string }).text, 'Reusable notes');
});

test('QR favorite repairs unsupported advanced settings to the safe V1 profile', () => {
  const node = createDefaultNode('qrCode', { x: 0, y: 0 });
  const snapshot = createFavoriteNodeSnapshot({
    ...node,
    data: {
      ...node.data,
      content: 'https://talkberry.example/register',
      contentMode: 'url',
      errorCorrectionLevel: 'H',
      foregroundColor: '#112233',
      backgroundColor: '#F7F7F7',
      margin: 6,
      outputFormat: 'png',
      pixelSize: 2048,
    },
  });
  const data = snapshot.data as unknown as Record<string, unknown>;

  assert.equal(data.content, 'https://talkberry.example/register');
  assert.equal(data.contentMode, 'url');
  assert.equal(data.errorCorrectionLevel, 'M');
  assert.equal(data.foregroundColor, '#000000');
  assert.equal(data.backgroundColor, '#FFFFFF');
  assert.equal(data.margin, 4);
  assert.equal(data.outputFormat, 'png');
  assert.equal(data.pixelSize, 1024);
});

test('favorite asset references can be restricted to server-approved durable assets', () => {
  const node = createDefaultNode('generateImage', { x: 0, y: 0 });
  const snapshot = createFavoriteNodeSnapshot({
    ...node,
    data: {
      ...node.data,
      resultAssetId: 'asset-approved',
      resultAssetIds: ['asset-approved', 'asset-denied'],
      resultMetadata: {
        'asset-approved': { model: 'approved-model' },
        'asset-denied': { model: 'denied-model' },
      },
    },
  });
  assert.deepEqual(
    new Set(getFavoriteNodeAssetIds(snapshot)),
    new Set(['asset-approved', 'asset-denied']),
  );

  const filtered = filterFavoriteNodeAssetIds(snapshot, new Set(['asset-approved']));
  const data = filtered.data as {
    resultAssetId?: string;
    resultAssetIds?: string[];
    resultMetadata?: Record<string, unknown>;
  };
  assert.equal(data.resultAssetId, 'asset-approved');
  assert.deepEqual(data.resultAssetIds, ['asset-approved']);
  assert.deepEqual(Object.keys(data.resultMetadata ?? {}), ['asset-approved']);

  const composition = createDefaultNode('composition', { x: 0, y: 0 });
  const compositionSnapshot = createFavoriteNodeSnapshot({
    ...composition,
    data: {
      ...composition.data,
      layers: [
        { assetId: 'asset-approved', id: 'layer-1', kind: 'image' },
        { assetId: 'asset-denied', id: 'layer-2', kind: 'image' },
      ],
    },
  });
  assert.deepEqual(
    new Set(getFavoriteNodeAssetIds(compositionSnapshot)),
    new Set(['asset-approved', 'asset-denied']),
  );
  const filteredComposition = filterFavoriteNodeAssetIds(
    compositionSnapshot,
    new Set(['asset-approved']),
  );
  assert.deepEqual(
    (filteredComposition.data as CompositionNodeData).layers?.map((layer) => layer.assetId),
    ['asset-approved', undefined],
  );
});
