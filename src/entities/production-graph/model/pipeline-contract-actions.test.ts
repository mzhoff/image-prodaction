import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createEmptyProjectUiState } from './project-schema.ts';
import type { ProductionGraphState } from './store-types.ts';
import { useProductionGraphStore } from './use-production-graph-store.ts';

const INPUT_NODE_ID = 'pipeline-input';
const TARGET_NODE_ID = 'text-generation';
const FIELD_ID = 'field-topic';

function resetStore() {
  useProductionGraphStore.setState({
    version: 1,
    nodes: [
      {
        id: INPUT_NODE_ID,
        type: 'pipelineInput',
        position: { x: 0, y: 0 },
        size: { width: 400, height: 190 },
        status: 'idle',
        data: {
          title: 'Pipeline Input',
          fields: [{ id: FIELD_ID, key: 'topic', kind: 'text', required: true }],
        },
      },
      {
        id: TARGET_NODE_ID,
        type: 'textGeneration',
        position: { x: 500, y: 0 },
        size: { width: 400, height: 757 },
        status: 'idle',
        data: {
          title: 'Text Gen',
          model: 'google/gemini-2.5-flash',
          instruction: 'Rewrite',
          outputStyle: 'plain',
        },
      },
    ],
    sections: [],
    edges: [{
      id: 'edge-input',
      sourceNodeId: INPUT_NODE_ID,
      sourcePortId: `field:${FIELD_ID}`,
      targetNodeId: TARGET_NODE_ID,
      targetPortId: 'text',
    }],
    assets: [],
    presets: [],
    subjects: [],
    locations: [],
    publications: [],
    runs: [],
    selectedNodeIds: [],
    selectedSectionIds: [],
    historyPast: [],
    historyFuture: [],
    uiState: createEmptyProjectUiState(),
  } as Partial<ProductionGraphState>);
}

beforeEach(resetStore);

test('incompatible type changes are blocked while a contract field is connected', () => {
  const result = useProductionGraphStore.getState().updatePipelineContractFields(INPUT_NODE_ID, [
    { id: FIELD_ID, key: 'topic', kind: 'number', required: true },
  ]);

  assert.equal(result.ok, false);
  assert.equal(useProductionGraphStore.getState().edges.length, 1);
  const node = useProductionGraphStore.getState().nodes.find((item) => item.id === INPUT_NODE_ID);
  assert.equal(node?.data && 'fields' in node.data ? node.data.fields[0]?.kind : undefined, 'text');
});

test('removing a field removes its edge in the same undo snapshot', () => {
  const result = useProductionGraphStore.getState().updatePipelineContractFields(INPUT_NODE_ID, []);

  assert.deepEqual(result, { ok: true });
  assert.equal(useProductionGraphStore.getState().edges.length, 0);
  assert.equal(useProductionGraphStore.getState().historyPast.length, 1);
  useProductionGraphStore.getState().undo();
  assert.equal(useProductionGraphStore.getState().edges.length, 1);
});
