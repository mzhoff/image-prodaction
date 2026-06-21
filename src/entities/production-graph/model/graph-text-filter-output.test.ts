import assert from 'node:assert/strict';
import test from 'node:test';
import { getIncomingImageInputs, getIncomingTextInputs, getNodeTextResult, getNodeTextResults, getRouterDataKind } from './graph-io.ts';
import type { AssetRecord, GraphEdge, ProductionNode } from './types.ts';

const sectionedText = [
  'Intro',
  '',
  '[Actors]',
  'Actor description.',
  '',
  '[Actions]',
  'Action description.',
].join('\n');

const expectedFilteredText = [
  'Intro',
  '',
  '[Actions]',
  'Action description.',
].join('\n');

test('text output nodes exclude disabled text sections from downstream text', () => {
  const nodes: ProductionNode[] = [
    createNode('prompt', 'textPrompt', {
      disabledResultFilterIds: ['actors'],
      result: sectionedText,
      text: sectionedText,
    }),
    createNode('concat', 'textConcat', {
      disabledResultFilterIds: ['actors'],
      result: sectionedText,
    }),
    createNode('iterator', 'iterator', {
      activeKind: 'text',
      activeText: sectionedText,
      disabledResultFilterIds: ['actors'],
    }),
    createNode('text-gen', 'textGeneration', {
      disabledResultFilterIds: ['actors'],
      result: sectionedText,
      resultTexts: [sectionedText],
    }),
    createNode('extract', 'imageToText', {
      disabledLayerIds: ['actors'],
      result: sectionedText,
    }),
  ];

  for (const node of nodes) {
    assert.equal(getNodeTextResult(node), expectedFilteredText, node.type);
  }
});

test('text output collections use filtered variants for supported nodes', () => {
  const textGeneration = createNode('text-gen', 'textGeneration', {
    disabledResultFilterIds: ['actors'],
    resultTexts: [sectionedText],
  });
  const prompt = createNode('prompt', 'textPrompt', {
    disabledResultFilterIds: ['actors'],
    result: sectionedText,
  });
  const concat = createNode('concat', 'textConcat', {
    disabledResultFilterIds: ['actors'],
    result: sectionedText,
  });
  const iterator = createNode('iterator', 'iterator', {
    activeKind: 'text',
    activeText: sectionedText,
    disabledResultFilterIds: ['actors'],
  });

  assert.deepEqual(getNodeTextResults(textGeneration), [expectedFilteredText]);
  assert.deepEqual(getNodeTextResults(prompt), [expectedFilteredText]);
  assert.deepEqual(getNodeTextResults(concat), [expectedFilteredText]);
  assert.deepEqual(getNodeTextResults(iterator), [expectedFilteredText]);
});

test('router proxies connected text without modifying it', () => {
  const source = createNode('source', 'textPrompt', {
    result: sectionedText,
    text: sectionedText,
  });
  const router = createNode('router', 'router', {});
  const target = createNode('target', 'textGeneration', {
    instruction: '',
    model: 'google/gemini-2.5-flash',
    outputStyle: 'plain',
    result: '',
    resultTexts: [],
  });
  const edges: GraphEdge[] = [
    { id: 'edge-source-router', sourceNodeId: source.id, sourcePortId: 'text', targetNodeId: router.id, targetPortId: 'input' },
    { id: 'edge-router-target', sourceNodeId: router.id, sourcePortId: 'output', targetNodeId: target.id, targetPortId: 'text' },
  ];
  const nodes = [source, router, target];

  assert.equal(getRouterDataKind(router, { edges, nodes }), 'text');
  const inputs = getIncomingTextInputs(target.id, 'text', { edges, nodes });
  assert.deepEqual(inputs.map((item) => item.text), [sectionedText]);
  assert.equal(inputs[0]?.sourceNode.id, source.id);
  assert.equal(inputs[0]?.sourceLabel, source.data.title);
  assert.equal(inputs[0]?.edge.id, 'edge-router-target');
});

test('router proxies connected image asset without modifying it', () => {
  const source = createNode('source-image', 'importImage', { assetId: 'asset-router-image' });
  const router = createNode('router-image', 'router', {});
  const target = createNode('target-image', 'generateImage', {
    activeResultIndex: -1,
    aspectRatio: '1:1',
    model: 'google/gemini-2.5-flash-image',
    prompt: '',
    resultAssetIds: [],
    size: '1K',
  });
  const edges: GraphEdge[] = [
    { id: 'edge-image-router', sourceNodeId: source.id, sourcePortId: 'image', targetNodeId: router.id, targetPortId: 'input' },
    { id: 'edge-router-image-target', sourceNodeId: router.id, sourcePortId: 'output', targetNodeId: target.id, targetPortId: 'reference' },
  ];
  const nodes = [source, router, target];
  const assets: AssetRecord[] = [{
    id: 'asset-router-image',
    kind: 'image',
    name: 'router.webp',
    mimeType: 'image/webp',
    createdAt: '2026-01-01T00:00:00.000Z',
    storage: { type: 'indexeddb', blobKey: 'router.webp' },
  }];

  assert.equal(getRouterDataKind(router, { edges, nodes }), 'image');
  assert.deepEqual(getIncomingImageInputs(target.id, 'reference', { assets, edges, nodes }).map((item) => item.assetId), ['asset-router-image']);
});

function createNode(typeId: string, type: ProductionNode['type'], data: Record<string, unknown>): ProductionNode {
  return {
    id: `node-${typeId}`,
    type,
    position: { x: 0, y: 0 },
    size: { width: 320, height: 320 },
    status: 'idle',
    data: {
      title: typeId,
      ...data,
    } as ProductionNode['data'],
  };
}
