import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompositionNodeData } from '@/entities/production-graph/model/types';
import { createCompositionRectanglePatch } from './composition-shape-actions.ts';

const baseData: CompositionNodeData = {
  aspectRatio: '9:16',
  canvasHeight: 1920,
  canvasWidth: 1080,
  layerOrder: ['layer-0'],
  layers: [],
  title: 'Story',
};

test('creates a selected local rectangle without adding a graph input', () => {
  const patch = createCompositionRectanglePatch({
    bounds: { height: 400.4, width: 700.6, x: 90.3, y: 120.7 },
    createId: () => 'fixed-id',
    data: baseData,
    layerInputCount: 2,
  });

  assert.equal(patch?.layers?.length, 1);
  assert.deepEqual(patch?.layers?.[0], {
    blur: 0,
    color: '#d9d9d9',
    cornerRadius: 0,
    fillOpacity: 100,
    height: 400,
    id: 'shape-fixed-id',
    kind: 'rectangle',
    name: 'Rectangle',
    opacity: 100,
    preserveAspectRatio: false,
    visible: true,
    width: 701,
    x: 90,
    y: 121,
  });
  assert.deepEqual(patch?.layerOrder, ['shape-fixed-id', 'layer-0']);
  assert.deepEqual(patch?.selectedLayerIds, ['shape-fixed-id']);
  assert.equal('layerInputCount' in (patch ?? {}), false);
});

test('keeps rectangle ids and names unique', () => {
  const data = {
    ...baseData,
    layers: [{ id: 'shape-fixed-id', kind: 'rectangle', name: 'Rectangle' }] as CompositionNodeData['layers'],
  };
  const patch = createCompositionRectanglePatch({
    bounds: { height: 80, width: 120, x: 10, y: 20 },
    createId: () => 'fixed-id',
    data,
    layerInputCount: 2,
  });

  assert.equal(patch?.layers?.at(-1)?.id, 'shape-fixed-id-2');
  assert.equal(patch?.layers?.at(-1)?.name, 'Rectangle 2');
});
