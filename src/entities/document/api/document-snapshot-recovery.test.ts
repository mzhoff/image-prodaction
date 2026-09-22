import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { createEmptyProjectUiState, createProjectExport, type ProjectExport } from '@/entities/production-graph/model/project-schema';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import type { TextToSpeechNodeData } from '@/entities/production-graph/model/types';
import { validateDocumentSnapshot } from '../server/document-validation';
import { fetchDocumentProject, saveDocumentProjectSnapshot } from './document-api';

const request = {
  idempotencyKey: 'same-paid-request', fingerprint: 'a'.repeat(64),
  metadata: { language: 'ru' as const, model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore' },
};
const jobId = '019ed347-66a4-7124-8000-000000000001';
const voiceData = () => useProductionGraphStore.getState().nodes[0]!.data as TextToSpeechNodeData;

beforeEach(() => {
  useProductionGraphStore.setState({
    ...structuredClone(initialProject),
    nodes: [{ ...createDefaultNode('textToSpeech', { x: 0, y: 0 }), id: 'voice' }],
    edges: [], historyPast: [], historyFuture: [], uiState: createEmptyProjectUiState(),
  });
});

for (const savedRequest of [request, { ...request, jobId }]) {
  test(`document PATCH serialization and reload preserve Voice identity ${'jobId' in savedRequest ? 'after' : 'before'} job acknowledgement`, async (context) => {
    const store = useProductionGraphStore.getState();
    store.setNodeStatus('voice', 'running');
    store.updateNodeDataSilent('voice', { speechRequest: savedRequest, resultAssetId: 'previous-result' });
    let persisted: ProjectExport | undefined;
    const methods: string[] = [];
    context.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      assert.equal(url, '/api/projects/document-1');
      methods.push(init?.method ?? 'GET');
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        assert.equal(body.expectedRevision, 3);
        persisted = validateDocumentSnapshot(body.snapshot);
        assert.deepEqual((persisted.project.nodes[0]!.data as TextToSpeechNodeData).speechRequest, savedRequest);
      }
      return Response.json({ project: { id: 'document-1', revision: 4, snapshot: persisted } });
    });

    await saveDocumentProjectSnapshot('document-1', store.exportDocumentSnapshot(), 3);
    store.resetProject();
    const loaded = await fetchDocumentProject('document-1');
    store.restoreDocumentSnapshot(loaded.snapshot);

    assert.deepEqual(methods, ['PATCH', 'GET']);
    assert.deepEqual(voiceData().speechRequest, savedRequest);
    assert.equal(voiceData().resultAssetId, 'previous-result');
    assert.equal(useProductionGraphStore.getState().nodes[0]!.id, 'voice');
    assert.equal(useProductionGraphStore.getState().nodes[0]!.status, 'idle');
    assert.equal(useProductionGraphStore.getState().historyPast.length, 0);
    // Recovery JSON has the same document semantics, not portable-copy semantics.
    store.restoreDocumentSnapshot(JSON.parse(JSON.stringify(persisted)));
    assert.deepEqual(voiceData().speechRequest, savedRequest);
    // Downloading this graph as a file must still detach the paid request.
    assert.equal((store.exportProjectSnapshot().project.nodes[0]!.data as TextToSpeechNodeData).speechRequest, undefined);
  });
}

test('finished Voice autosave removes the request and preserves its final artifact on reload', () => {
  const store = useProductionGraphStore.getState();
  store.updateNodeDataSilent('voice', { speechRequest: { ...request, jobId } });
  store.updateNodeDataSilent('voice', { speechRequest: undefined, resultAssetId: 'final-mp3' });
  const snapshot = JSON.parse(JSON.stringify(store.exportDocumentSnapshot()));
  assert.equal(Object.hasOwn(snapshot.project.nodes[0].data, 'speechRequest'), false);
  store.resetProject();
  store.restoreDocumentSnapshot(snapshot);
  assert.equal(voiceData().speechRequest, undefined);
  assert.equal(voiceData().resultAssetId, 'final-mp3');
});

test('same-document restore rejects templates and normalizes malformed job identity', () => {
  const store = useProductionGraphStore.getState();
  assert.throws(() => store.restoreDocumentSnapshot(store.exportPipelineTemplate()), /project snapshot/u);
  const snapshot = store.exportDocumentSnapshot();
  snapshot.project.nodes[0] = { ...snapshot.project.nodes[0]!,
    data: { ...(snapshot.project.nodes[0]!.data as TextToSpeechNodeData), speechRequest: { ...request, jobId: '../../another-job' } },
  };
  store.restoreDocumentSnapshot(snapshot);
  assert.equal(voiceData().speechRequest, undefined);
});


test('opening an empty document cannot bring back the previous graph through undo', () => {
  const store = useProductionGraphStore.getState();
  store.updateNodeData('voice', { text: 'Previous document' });
  store.restoreDocumentSnapshot(createProjectExport(initialProject, createEmptyProjectUiState()));
  store.undo();
  const next = useProductionGraphStore.getState();
  assert.deepEqual(next.nodes, []);
  assert.deepEqual(next.edges, []);
  assert.deepEqual(next.assets, []);
  assert.deepEqual(next.historyPast, []);
  assert.deepEqual(next.historyFuture, []);
});
