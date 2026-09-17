import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import type { GraphProject, ProductionNode, ReverieStoriesNodeData } from '@/entities/production-graph/model/types';
import { getStoriesRuntimeDescriptor, storiesOutputContract } from './studio-stories-descriptor';
import { compileStudioSection } from './studio-pipeline-compiler';
import { isProductionPipelineHandlerSupported } from '../../server/pipeline-production-manifest';

function project(): GraphProject {
  const input: ProductionNode = { ...createDefaultNode('pipelineInput', { x: 100, y: 100 }), id: 'input',
    data: { title: 'Brief', fields: [{ id: 'brief', key: 'brief', kind: 'text', required: true }] } };
  const story = { ...createDefaultNode('reverieStories', { x: 700, y: 100 }), id: 'stories' };
  return { ...initialProject, nodes: [input, story], edges: [{ id: 'title', sourceNodeId: 'input', sourcePortId: 'field:brief',
    targetNodeId: 'stories', targetPortId: 'title' }], sections: [{ id: 'section', title: 'Stories', position: { x: 0, y: 0 }, size: { width: 2000, height: 2000 } }] };
}
test('semantic Stories terminal supplies the output boundary without mutating the authored graph', () => {
  const graph = project(); const before = structuredClone(graph);
  const result = compileStudioSection(graph, 'section', { isHandlerSupported: isProductionPipelineHandlerSupported });
  assert.deepEqual(graph, before);
  assert.deepEqual(result.compiledPlan.definition.outputContracts, { story: storiesOutputContract() });
  assert.deepEqual(result.compiledPlan.definition.outputs, { story: { nodeId: 'stories', outputKey: 'story' } });
  assert.equal(result.sourceMetadata.outputs[0]?.nodeId, 'stories');
  assert.equal(result.sourceMetadata.nodeCount, 2);
  assert.equal(result.sourceMetadata.capabilityKey, 'content.generate-stories');
});

test('multiple generated slides compile through one semantic sequence without JSON authoring', () => {
  const graph = project();
  const second = { ...graph.nodes[1]!, id: 'second' };
  const sequence: ProductionNode = { ...createDefaultNode('reverieStories', { x: 1200, y: 100 }), id: 'sequence',
    data: { ...createDefaultNode('reverieStories', { x: 0, y: 0 }).data, storyMode: 'sequence' } };
  graph.nodes.push(second, sequence);
  graph.edges.push({ id: 'first-sequence', sourceNodeId: 'stories', sourcePortId: 'story', targetNodeId: 'sequence', targetPortId: 'document' },
    { id: 'second-sequence', sourceNodeId: 'second', sourcePortId: 'story', targetNodeId: 'sequence', targetPortId: 'document-2' });
  const result = compileStudioSection(graph, 'section', { isHandlerSupported: isProductionPipelineHandlerSupported });
  assert.deepEqual(result.compiledPlan.definition.outputs, { story: { nodeId: 'sequence', outputKey: 'story' } });
  assert.equal(result.compiledPlan.definition.nodes.length, 3);
  assert.equal(result.sourceMetadata.outputs[0]?.nodeId, 'sequence');
});
test('multiple semantic terminals and missing Pipeline Input fail with an actionable error', () => {
  const graph = project(); graph.nodes.push({ ...graph.nodes[1]!, id: 'second' });
  assert.throws(() => compileStudioSection(graph, 'section'), /одна терминальная/);
  const missing = project(); missing.nodes.shift(); missing.edges = [];
  assert.throws(() => compileStudioSection(missing, 'section'), /Pipeline Input/);
});

test('editing a generated result does not freeze the next recipe execution', () => {
  const graph = project();
  const node = graph.nodes[1]!;
  // The editor can preserve incomplete content. It must never become recipe
  // config when connected inputs will generate the next result.
  node.data = { ...node.data, document: { schemaVersion: 'stories.document-draft@1.0.0',
    id: 'draft', revisionId: 'draft-r1', locale: 'ru-RU',
    styleProfile: { profileId: 'reverie-default', revisionId: 'reverie-default-r1' },
    preview: { title: 'Локальная правка', accessibilityLabel: 'Черновик' }, slides: [] } };
  const result = compileStudioSection(graph, 'section', { isHandlerSupported: isProductionPipelineHandlerSupported });
  assert.equal(result.compiledPlan.definition.nodes[0]?.config?.document, undefined);
  assert.ok(getStoriesRuntimeDescriptor(node).config.document);
  assert.equal(getStoriesRuntimeDescriptor({ ...node, data: { ...node.data, storyMode: 'sequence' } }).config.document, undefined);
  assert.ok((node.data as ReverieStoriesNodeData).document, 'the saved content draft remains in the authored graph');
});
