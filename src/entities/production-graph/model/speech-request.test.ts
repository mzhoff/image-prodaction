import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createDefaultNode } from './create-default-node';
import { normalizeNode } from './normalize-project-node';
import { normalizeSpeechRequest } from './speech-request';
import { createFavoriteNodeSnapshot } from './favorite-node-preset';
import { createEmptyProjectUiState } from './project-schema';
import { createPipelineTemplateExport, createProjectSnapshotExport, normalizePortableProjectExport } from './project-portability';
import { initialProject } from './initial-project';
import { useProductionGraphStore } from './use-production-graph-store';
import type { ProductionNode, TextToSpeechNodeData } from './types';

const request = { idempotencyKey: '0b886b86-3113-4f9a-a6b7-ea0f8c5dab60', fingerprint: 'a'.repeat(64),
  jobId: '019ed347-66a4-7124-8000-000000000001', metadata: { language: 'ru' as const, model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore' },
};
const voice = (): ProductionNode => { const node = createDefaultNode('textToSpeech', { x: 0, y: 0 }); return {
  ...node, id: 'voice', status: 'running', data: { ...(node.data as TextToSpeechNodeData), speechRequest: request, resultAssetId: 'completed-audio' },
}; };
beforeEach(() => useProductionGraphStore.setState({ ...structuredClone(initialProject), nodes: [voice()], edges: [],
  selectedNodeIds: [], selectedSectionIds: [], historyPast: [], historyFuture: [], uiState: createEmptyProjectUiState(),
}));

test('saved Voice request survives normalization for same-node recovery, with only bounded known fields', () => {
  const normalized = normalizeNode(voice()).data as TextToSpeechNodeData;
  assert.deepEqual(normalized.speechRequest, request);
  assert.deepEqual(normalizeSpeechRequest({ ...request, secret: 'not copied', metadata: { ...request.metadata, token: 'not copied' } }), request);
  for (const invalid of [null, {}, { ...request, fingerprint: 'bad' }, { ...request, jobId: '../../jobs' },
    { ...request, idempotencyKey: 'a\nheader' }, { ...request, metadata: { ...request.metadata, language: 'unknown' } },
    { ...request, metadata: { ...request.metadata, model: 'x'.repeat(241) } }]) {
    assert.equal(normalizeSpeechRequest(invalid), undefined);
  }
});
test('Duplicate and clipboard paste keep completed audio but never resume the original node job', () => {
  const store = useProductionGraphStore.getState();
  store.duplicateNode('voice');
  store.pasteNodes([voice()], [], { x: 500, y: 500 });
  const nodes = useProductionGraphStore.getState().nodes;
  assert.equal(nodes.length, 3);
  assert.deepEqual((nodes[0]!.data as TextToSpeechNodeData).speechRequest, request);
  for (const copy of nodes.slice(1)) {
    assert.equal(copy.status, 'idle');
    assert.equal((copy.data as TextToSpeechNodeData).speechRequest, undefined);
    assert.equal((copy.data as TextToSpeechNodeData).resultAssetId, 'completed-audio');
  }
});
test('portable snapshots, pipeline templates, and node favorites never transfer Voice job identity', () => {
  const project = { ...structuredClone(initialProject), nodes: [voice()] };
  const ui = createEmptyProjectUiState();
  const snapshot = createProjectSnapshotExport(project, ui);
  assert.equal((snapshot.project.nodes[0]!.data as TextToSpeechNodeData).speechRequest, undefined);
  const oldSnapshot = { ...snapshot, project };
  assert.equal((normalizePortableProjectExport(oldSnapshot).project.nodes[0]!.data as TextToSpeechNodeData).speechRequest, undefined);
  assert.equal((createPipelineTemplateExport(project, ui).project.nodes[0]!.data as TextToSpeechNodeData).speechRequest, undefined);
  assert.equal((createFavoriteNodeSnapshot(voice()).data as TextToSpeechNodeData).speechRequest, undefined);
  assert.deepEqual((project.nodes[0]!.data as TextToSpeechNodeData).speechRequest, request);
});
test('duplicate image nodes likewise detach their active request instead of resuming another node generation', () => {
  const image = { ...createDefaultNode('generateImage', { x: 0, y: 0 }), id: 'image', status: 'running' as const,
    data: { title: 'Image', model: 'test', aspectRatio: '1:1', size: '1K', generationRequest: { fingerprint: 'same', idempotencyKey: 'same', jobId: request.jobId } },
  } as ProductionNode;
  useProductionGraphStore.setState({ nodes: [image] });
  useProductionGraphStore.getState().duplicateNode('image');
  const copy = useProductionGraphStore.getState().nodes[1]!;
  assert.equal(copy.status, 'idle');
  assert.equal(Object.hasOwn(copy.data, 'generationRequest'), false);
  assert.equal(Object.hasOwn(image.data, 'generationRequest'), true);
});
