import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { applyPipelineBuildPatch, parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build';
import type { ProductionNode } from '@/entities/production-graph/model/types';

function assertLayout(nodes: ProductionNode[]) {
  for (const [index, node] of nodes.entries()) {
    assert.ok(node.position.x >= 80 && node.position.y >= 80);
    assert.ok(node.position.x + node.size.width <= 3920);
    assert.ok(node.position.y + node.size.height <= 3920);
    for (const other of nodes.slice(index + 1)) {
      assert.ok(node.position.x + node.size.width <= other.position.x
        || other.position.x + other.size.width <= node.position.x
        || node.position.y + node.size.height <= other.position.y
        || other.position.y + other.size.height <= node.position.y, `${node.id} overlaps ${other.id}`);
    }
  }
}

for (const direction of ['horizontal', 'vertical'] as const) {
  test(`lays out all 24 independent text nodes inside the canvas (${direction})`, () => {
    const input = parsePipelineBuildInput({
      summary: 'Keep every editable text component.', documentName: 'Large brief',
      nodes: Array.from({ length: 24 }, (_, index) => ({ key: `text-${index}`, type: 'textPrompt', settings: { text: `Part ${index}` } })),
      edges: [], layout: { direction },
    });
    const result = preparePipelineBuild(input, structuredClone(initialProject));
    assert.equal(result.patch.nodes.length, 24);
    assertLayout(result.patch.nodes);
  });
}

test('prepares the eleven-node editable infographic shape that previously exceeded canvas bounds', () => {
  const input = parsePipelineBuildInput({
    summary: 'Keep text, background, hero and decoration separately editable.', documentName: 'Infographic',
    nodes: [
      ...Array.from({ length: 6 }, (_, index) => ({ key: `text-${index}`, type: 'textPrompt', settings: { text: `Editable part ${index}` } })),
      ...Array.from({ length: 3 }, (_, index) => ({ key: `image-${index}`, type: 'generateImage' })),
      { key: 'composition', type: 'composition' }, { key: 'export', type: 'exportImage' },
    ],
    edges: [
      ...Array.from({ length: 3 }, (_, index) => ({ sourceNodeKey: `text-${index}`, sourcePortId: 'text', targetNodeKey: `image-${index}`, targetPortId: 'prompt' })),
      { sourceNodeKey: 'composition', sourcePortId: 'image', targetNodeKey: 'export', targetPortId: 'image-0' },
    ],
    compositionBlueprints: [{ version: 1, compositionNodeRef: 'composition', mode: 'replace', canvas: { width: 1080, height: 1920 }, layers: [
      ...Array.from({ length: 3 }, (_, index) => ({ key: `visual-${index}`, name: `Visual ${index}`, kind: 'image', role: 'background', source: { nodeRef: `image-${index}`, portId: 'image' }, frame: { x: 0, y: index / 3, width: 1, height: 0.3 }, zIndex: index })),
      ...Array.from({ length: 3 }, (_, index) => ({ key: `copy-${index}`, name: `Copy ${index}`, kind: 'text', role: 'body', source: { nodeRef: `text-${index + 3}`, portId: 'text' }, frame: { x: 0.1, y: index / 3, width: 0.8, height: 0.2 }, zIndex: index + 3 })),
    ] }],
  });
  const result = preparePipelineBuild(input, structuredClone(initialProject));
  assert.equal(result.patch.nodes.length, 11);
  assert.equal(result.patch.edges.length, 10);
  assertLayout(result.patch.nodes);
});

test('compact fallback preserves existing nodes and keeps the added group clear of them', () => {
  const seed = preparePipelineBuild(parsePipelineBuildInput({ documentName: 'Existing graph', summary: 'Existing content', nodes: [{ key: 'existing', type: 'textPrompt' }], edges: [] }), structuredClone(initialProject));
  const current = applyPipelineBuildPatch(structuredClone(initialProject), seed.patch);
  const before = structuredClone(current);
  const result = preparePipelineBuild(parsePipelineBuildInput({ documentName: 'Existing graph', summary: 'More editable parts', nodes: Array.from({ length: 24 }, (_, index) => ({ key: `part-${index}`, type: 'textPrompt' })), edges: [] }), current);
  assert.deepEqual(current, before);
  assert.equal(result.patch.nodes.length, 24);
  assertLayout([...current.nodes, ...result.patch.nodes]);
});
