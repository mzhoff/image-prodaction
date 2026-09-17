import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import type { GraphProject, ProductionNode, TimelineHandoffNodeData } from '@/entities/production-graph/model/types';
import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import { TIMELINE_PUBLIC_SCHEMA } from '@/shared/media/timeline-public-contract';
import { compileStudioSection } from './studio-pipeline-compiler';
import { isProductionPipelineHandlerSupported } from '../../server/pipeline-production-manifest';

const sourceId = '019ed347-66a4-7124-8000-000000000001';
const analysis: TimelineAnalysis = { version: 1, sourceAssetId: sourceId, sourceChecksum: 'a'.repeat(64),
  durationMs: 1000, frameTimesMs: [0, 500], shots: [{ id: 'shot', startMs: 0, endMs: 1000, frames: [{ timeMs: 500 }], description: '' }],
};

function project(): GraphProject {
  const input = node('input', 'pipelineInput', { title: 'Input', fields: [{ id: 'note', key: 'note', kind: 'text', required: false }] });
  const source = node('source', 'importImage', { title: 'Video', mediaKind: 'video', assetId: sourceId });
  const timeline = node('handoff', 'timelineHandoff', { ...createDefaultNode('timelineHandoff', { x: 0, y: 0 }).data, analysis });
  const output = node('output', 'pipelineOutput', { title: 'Output', fields: [{ id: 'timeline', key: 'timeline', kind: 'json', required: true, fields: [] }] });
  return { ...initialProject, nodes: [input, source, timeline, output], edges: [
    { id: 'source-handoff', sourceNodeId: source.id, sourcePortId: 'original', targetNodeId: timeline.id, targetPortId: 'video' },
    { id: 'handoff-output', sourceNodeId: timeline.id, sourcePortId: 'timeline', targetNodeId: output.id, targetPortId: 'field:timeline' },
  ], sections: [{ id: 'section', title: 'Handoff', position: { x: 0, y: 0 }, size: { width: 2000, height: 2000 } }] };
}
function node(id: string, type: ProductionNode['type'], data: unknown): ProductionNode {
  return { ...createDefaultNode(type, { x: 100, y: 100 }), id, data } as ProductionNode;
}

test('reviewed Timeline compiles video to a canonical JSON contract without manual nested array fields', () => {
  const graph = project();
  const plan = compileStudioSection(graph, 'section', { isHandlerSupported: isProductionPipelineHandlerSupported }).compiledPlan;
  const handoff = plan.definition.nodes.find((entry) => entry.id === 'handoff')!;
  assert.equal(handoff.handlerType, 'timeline.handoff');
  assert.deepEqual(handoff.config, { analysis });
  assert.deepEqual(handoff.inputs.video, { source: 'node-output', nodeId: 'source', outputKey: 'original' });
  assert.deepEqual(plan.definition.outputContracts?.timeline?.schema, TIMELINE_PUBLIC_SCHEMA);
  graph.nodes[2]!.data = { ...graph.nodes[2]!.data, activeShotIndex: 100, previewMode: 'image' } as TimelineHandoffNodeData;
  assert.deepEqual(compileStudioSection(graph, 'section').compiledPlan, plan);
});

test('Timeline publication fails closed for missing analysis, running jobs, missing video and source replacement', () => {
  for (const patch of [{ analysis: undefined }, { analysis: { ...analysis, shots: [] } }, { request: { jobId: 'running' } }]) {
    const graph = project(); graph.nodes[2]!.data = { ...graph.nodes[2]!.data, ...patch } as TimelineHandoffNodeData;
    assert.throws(() => compileStudioSection(graph, 'section'), /Timeline Handoff/);
  }
  const missing = project(); missing.edges.shift();
  assert.throws(() => compileStudioSection(missing, 'section'), /video-вход/);
  const changed = project(); changed.nodes[1]!.data = { ...changed.nodes[1]!.data, assetId: '019ed347-66a4-7124-8000-000000000002' };
  assert.throws(() => compileStudioSection(changed, 'section'), /изменилось/);
});

test('typed Timeline outputs pin selection and Frames publish with their real collection contract', () => {
  const graph = project();
  const frameId = '019ed347-66a4-7124-8000-000000000007';
  const reviewed = structuredClone(analysis); reviewed.shots[0]!.frames[0]!.assetId = frameId;
  graph.nodes[2]!.data = { ...graph.nodes[2]!.data, analysis: reviewed, outputScope: 'selected', activeShotIndex: 0 } as TimelineHandoffNodeData;
  graph.nodes[3]!.data = { title: 'Output', fields: [{ id: 'frames', key: 'frames', kind: 'image', required: true }] };
  graph.edges[1] = { ...graph.edges[1]!, sourcePortId: 'frames', targetPortId: 'field:frames' };
  const plan = compileStudioSection(graph, 'section').compiledPlan;
  assert.equal(plan.definition.outputContracts?.frames?.kind, 'image_collection');
  assert.equal(plan.definition.nodes.find((entry) => entry.id === 'handoff')?.config.outputScope, 'selected');
  assert.equal(plan.definition.nodes.find((entry) => entry.id === 'handoff')?.config.activeShotIndex, 0);
  graph.nodes[2]!.data = { ...graph.nodes[2]!.data, analysis } as TimelineHandoffNodeData;
  assert.throws(() => compileStudioSection(graph, 'section'), /всех выбранных стоп-кадров/);
});
