import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node';
import { createNodeTemplateSnapshot } from './node-template-preset';
import { getNodeTemplatePresentation } from './node-template-presentation';

test('template presentation keeps a custom title and compact generation settings', () => {
  const node = createDefaultNode('generateImage', { x: 0, y: 0 });
  const presentation = getNodeTemplatePresentation({
    snapshot: createNodeTemplateSnapshot({
      ...node,
      data: {
        ...node.data,
        aspectRatio: '9:16',
        model: 'google/gemini-2.5-flash-image',
        size: '2K',
        title: 'Stories generator',
      },
    }),
  });

  assert.deepEqual(presentation, {
    detailLines: [
      'Model · google/gemini-2.5-flash-image',
      'Ratio 9:16 · Size 2K',
    ],
    inputCount: 12,
    title: 'Stories generator',
    typeLabel: 'Generate image',
  });
});

test('template presentation summarizes dynamic export inputs in at most four rows', () => {
  const node = createDefaultNode('exportImage', { x: 0, y: 0 });
  const presentation = getNodeTemplatePresentation({
    snapshot: createNodeTemplateSnapshot({
      ...node,
      data: {
        ...node.data,
        background: 'white',
        format: 'webp',
        imageInputCount: 4,
        quality: '82',
        scale: '0.5',
      },
    }),
  });

  assert.equal(presentation.inputCount, 4);
  assert.equal(presentation.typeLabel, 'Export image');
  assert.deepEqual(presentation.detailLines, [
    'WEBP · Quality 82 · 0.5×',
    'Background · white',
  ]);
  assert.ok(2 + presentation.detailLines.length <= 4);
});
