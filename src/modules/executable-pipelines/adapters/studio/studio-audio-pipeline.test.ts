import assert from 'node:assert/strict';
import test from 'node:test';
import type { GraphProject, ProductionNode } from '@/entities/production-graph/model/types';
import { compileStudioSection } from './studio-pipeline-compiler';
import { createProductionPipelineHandlerRegistry } from '../../server/pipeline-production-handlers';
import { executeCompiledPipeline, validatePipelineOutputValues } from '../../core/pipeline-executor';

test('audio contract compiles and executes Input → Convert → STT → Voice → Output', async () => {
  const graph = project();
  const compiled = compileStudioSection(graph, 'section').compiledPlan;
  assert.equal(compiled.definition.inputs.recording?.kind, 'audio');
  assert.equal(compiled.definition.outputContracts?.voice?.kind, 'audio');
  assert.deepEqual(compiled.definition.nodes.map((node) => node.handlerType), ['audio.convert', 'ai.audio.transcribe', 'ai.audio.generate']);
  const calls: string[] = [];
  const artifact = { kind: 'audio' as const, assetId: 'audio-file', mimeType: 'audio/mpeg' };
  const handlers = createProductionPipelineHandlerRegistry({ actorUserId: 'user' }, { audio: {
    async convertAudio(input) { calls.push('convert'); assert.equal(input.artifact.assetId, 'source'); return artifact; },
    async transcribeAudio(input) { calls.push('transcribe'); assert.equal(input.artifact.assetId, 'audio-file'); return 'Тестовая запись'; },
    async generateAudio(input) { calls.push('voice'); assert.equal(input.text, 'Тестовая запись'); return artifact; },
  } });
  const result = await executeCompiledPipeline({
    plan: compiled, handlers, inputs: { recording: { kind: 'audio', assetId: 'source' } },
    context: { runId: 'run', pipelineId: 'pipeline', pipelineVersion: 1, workspaceId: 'workspace', sourceApplication: 'test' },
    signal: new AbortController().signal,
  });
  assert.deepEqual(calls, ['convert', 'transcribe', 'voice']);
  assert.deepEqual(result.outputs, { transcript: 'Тестовая запись', voice: artifact });
  validatePipelineOutputValues(compiled.definition.outputContracts!, result.outputs);
});

test('audio compiler rejects an image wired into the audio conversion input', () => {
  const graph = project();
  graph.nodes[0]!.data = { title: 'Input', fields: [{ id: 'recording', key: 'recording', kind: 'image', required: true }] };
  assert.throws(() => compileStudioSection(graph, 'section'), /несовместимые/);
});

test('explicit Import preserves the stored audio reference; legacy Import remains an audio API boundary', () => {
  const graph = project();
  graph.nodes[0]!.data = { title: 'Input', fields: [{ id: 'note', key: 'note', kind: 'text', required: false }] };
  graph.nodes.push(node('import', 'importImage', { title: 'Recording', mediaKind: 'audio', assetId: 'stored-audio' }));
  graph.edges[0] = edge('import', 'image', 'convert', 'source');
  const explicit = compileStudioSection(graph, 'section').compiledPlan.definition;
  assert.equal(explicit.nodes.find((n) => n.id === 'import')?.handlerType, 'asset.reference');
  assert.deepEqual(explicit.nodes.find((n) => n.id === 'convert')?.inputs.source, { source: 'node-output', nodeId: 'import', outputKey: 'asset' });
  graph.nodes = graph.nodes.filter((n) => !['input', 'output'].includes(n.id));
  graph.edges = graph.edges.filter((e) => e.targetNodeId !== 'output');
  assert.equal(compileStudioSection(graph, 'section').compiledPlan.definition.inputs.recording?.kind, 'audio');
});

function project(): GraphProject {
  return {
    version: 1, nodes: [
      node('input', 'pipelineInput', { title: 'Input', fields: [{ id: 'recording', key: 'recording', kind: 'audio', required: true }] }),
      node('convert', 'audioConvert', { title: 'Convert', format: 'mp3', bitrateKbps: 192 }),
      node('stt', 'speechToText', { title: 'Speech to Text', model: 'google/gemini-3.1-flash-lite', result: '' }),
      node('tts', 'textToSpeech', { title: 'Voice', model: 'x-ai/grok-tts', voice: 'Eve', language: 'auto', responseFormat: 'mp3' }),
      node('output', 'pipelineOutput', { title: 'Output', fields: [
        { id: 'text', key: 'transcript', kind: 'text', required: true }, { id: 'voice', key: 'voice', kind: 'audio', required: true },
      ] }),
    ], edges: [edge('input', 'field:recording', 'convert', 'source'), edge('convert', 'audio', 'stt', 'audio'),
      edge('stt', 'text', 'tts', 'text'), edge('stt', 'text', 'output', 'field:text'), edge('tts', 'audio', 'output', 'field:voice')],
    sections: [{ id: 'section', title: 'Audio', position: { x: 0, y: 0 }, size: { width: 2000, height: 1000 } }],
    assets: [], presets: [], subjects: [], locations: [], publications: [], runs: [], selectedNodeIds: [], selectedSectionIds: [],
  };
}
function node(id: string, type: ProductionNode['type'], data: Record<string, unknown>): ProductionNode {
  return { id, type, position: { x: 100, y: 100 }, size: { width: 280, height: 360 }, status: 'idle', data } as unknown as ProductionNode;
}
function edge(sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId: string) {
  return { id: `${sourceNodeId}-${targetNodeId}-${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId };
}
