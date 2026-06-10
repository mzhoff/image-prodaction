import assert from 'node:assert/strict';
import test from 'node:test';
import { getNodeTextResult, getNodeTextResults } from './graph-io.ts';
import type { ProductionNode } from './types.ts';

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
