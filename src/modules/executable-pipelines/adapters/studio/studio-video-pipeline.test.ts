import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStudioSection } from './studio-pipeline-compiler';
import { executeCompiledPipeline } from '../../core/pipeline-executor';
import { createVideoPipelineHandlers } from '../../server/pipeline-video-handlers';
import { createAudioPipelineHandlers } from '../../server/pipeline-audio-handlers';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import type { GraphProject, ProductionNode } from '@/entities/production-graph/model/types';

test('explicit video Import → original/muted/audio Output compiles selected track and executes server derivation', async () => {
  const graph = project();
  const plan = compileStudioSection(graph, 'section').compiledPlan;
  const source = plan.definition.nodes.find((entry) => entry.id === 'import')!;
  assert.equal(source.handlerType, 'video.import');
  assert.deepEqual(source.config, { assetId: 'stored-video', audioTrackIndex: 2, outputPorts: ['original', 'video', 'audio'] });
  assert.equal(plan.definition.outputContracts?.original?.kind, 'video');
  assert.equal(plan.definition.outputContracts?.video?.kind, 'video');
  assert.equal(plan.definition.outputContracts?.audio?.kind, 'audio');
  const original = { kind: 'video' as const, assetId: 'stored-video' };
  const handlers = createVideoPipelineHandlers({ async resolveVideo() { return original; },
    async deriveVideo(input) { return { kind: input.kind === 'audio' ? 'audio' : 'video', assetId: input.kind }; },
  });
  const result = await executeCompiledPipeline({ plan, inputs: {}, handlers: { resolve(type, version) {
    return handlers.find((handler) => handler.handlerType === type && handler.handlerVersion === version) ?? null;
  } }, context: { runId: 'run', workspaceId: 'workspace', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test' }, signal: new AbortController().signal });
  assert.deepEqual(result.outputs, { original, video: { kind: 'video', assetId: 'video-only' }, audio: { kind: 'audio', assetId: 'audio' } });
});
test('Import audio output reaches STT even with a transparent router', async () => {
  const graph = project();
  graph.nodes.push(node('router', 'router', { title: 'Router' }), node('stt', 'speechToText', { title: 'Transcribe', model: 'test', result: '' }));
  graph.nodes.find((entry) => entry.id === 'output')!.data = { title: 'Output', fields: [{ id: 'text', key: 'text', kind: 'text', required: true }] };
  graph.edges = [edge('import', 'audio', 'router', 'input'), edge('router', 'output', 'stt', 'audio'), edge('stt', 'text', 'output', 'field:text')];
  const plan = compileStudioSection(graph, 'section').compiledPlan;
  assert.deepEqual(plan.definition.nodes.find((entry) => entry.id === 'import')?.config.outputPorts, ['audio']);
  assert.deepEqual(plan.definition.nodes.find((entry) => entry.id === 'stt')?.inputs.audio, { source: 'node-output', nodeId: 'import', outputKey: 'audio' });
  const audio = { kind: 'audio' as const, assetId: 'derived-track' };
  const handlers = [
    ...createVideoPipelineHandlers({ async resolveVideo() { return { kind: 'video', assetId: 'video' }; }, async deriveVideo() { return audio; } }),
    ...createAudioPipelineHandlers({ async convertAudio() { return audio; }, async generateAudio() { return audio; }, async resolveAsset() { return audio; },
      async transcribeAudio(input) { assert.equal(input.artifact.assetId, 'derived-track'); return 'Полная расшифровка'; },
    }),
  ];
  const result = await executeCompiledPipeline({ plan, inputs: {}, handlers: { resolve(type, version) {
    return handlers.find((handler) => handler.handlerType === type && handler.handlerVersion === version) ?? null;
  } }, context: { runId: 'run', workspaceId: 'workspace', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test' }, signal: new AbortController().signal });
  assert.equal(result.outputs.text, 'Полная расшифровка');
});
test('video Output cannot accept the extracted audio port and pinned config never copies cached derivatives', () => {
  const graph = project();
  graph.nodes.find((entry) => entry.id === 'import')!.data = { ...graph.nodes.find((entry) => entry.id === 'import')!.data, videoOnlyAssetId: 'stale-cached-file' };
  assert.equal(JSON.stringify(compileStudioSection(graph, 'section').compiledPlan).includes('stale-cached-file'), false);
  graph.edges[0]!.sourcePortId = 'audio';
  assert.throws(() => compileStudioSection(graph, 'section'), /несовместимые/);
});
function project(): GraphProject {
  return { ...initialProject, nodes: [node('input', 'pipelineInput', { title: 'Input', fields: [{ id: 'note', key: 'note', kind: 'text', required: false }] }),
    node('import', 'importImage', { title: 'Import', assetId: 'stored-video', mediaKind: 'video', videoAudioTrackIndex: 2 }),
    node('output', 'pipelineOutput', { title: 'Output', fields: [
      { id: 'original', key: 'original', kind: 'video', required: true },
      { id: 'video', key: 'video', kind: 'video', required: true },
      { id: 'audio', key: 'audio', kind: 'audio', required: true },
    ] }),
  ], edges: [edge('import', 'original', 'output', 'field:original'), edge('import', 'video', 'output', 'field:video'), edge('import', 'audio', 'output', 'field:audio')],
  sections: [{ id: 'section', title: 'Video', position: { x: 0, y: 0 }, size: { width: 2000, height: 1000 } }], assets: [],
  };
}
function node(id: string, type: ProductionNode['type'], data: Record<string, unknown>): ProductionNode {
  return { id, type, position: { x: 100, y: 100 }, size: { width: 280, height: 360 }, status: 'idle', data } as unknown as ProductionNode;
}
function edge(sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) {
  return { id: `${sourceNodeId}-${targetNodeId}-${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}
