import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductionNode, TextPromptNodeData } from './types';
import { connectEdgeState } from './graph-connect-edge-state.ts';

const pipelineInput = {
  id: 'pipeline-input',
  type: 'pipelineInput',
  position: { x: 0, y: 0 },
  size: { width: 300, height: 200 },
  status: 'idle',
  data: {
    title: 'Pipeline Input',
    fields: [{ id: 'article-field', key: 'articleSummary', kind: 'text', required: true }],
  },
} as ProductionNode;

test('connecting Pipeline Input preserves a local instruction and adds an explicit variable mention', () => {
  const prompt = createPrompt('Create a cover based on this article:');
  const state = connectEdgeState([pipelineInput, prompt], [], {
    sourceNodeId: pipelineInput.id,
    sourcePortId: 'field:article-field',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  });

  const data = state.nodes.find((node) => node.id === prompt.id)?.data as TextPromptNodeData;
  assert.equal(data.text, 'Create a cover based on this article:\n\n@Variable 1');
  assert.equal(data.variables?.[0]?.id, 'variable-0');
  assert.equal(data.variables?.[0]?.alias, 'Variable 1');
});

test('connecting the same canonical prompt variable does not duplicate its mention', () => {
  const prompt = createPrompt('Instruction\n\n@Variable 1');
  const state = connectEdgeState([pipelineInput, prompt], [], {
    sourceNodeId: pipelineInput.id,
    sourcePortId: 'field:article-field',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  });

  const data = state.nodes.find((node) => node.id === prompt.id)?.data as TextPromptNodeData;
  assert.equal(data.text, 'Instruction\n\n@Variable 1');
});

test('an ordinary text connection keeps an existing local prompt unchanged', () => {
  const localSource = {
    id: 'local-source',
    type: 'textPrompt',
    position: { x: 0, y: 0 },
    size: { width: 300, height: 360 },
    status: 'idle',
    data: { title: 'Local source', text: 'Local value', result: '', variables: [] },
  } as ProductionNode;
  const prompt = createPrompt('Keep this instruction unchanged.');
  const state = connectEdgeState([localSource, prompt], [], {
    sourceNodeId: localSource.id,
    sourcePortId: 'text',
    targetNodeId: prompt.id,
    targetPortId: 'variable-0',
  });

  const data = state.nodes.find((node) => node.id === prompt.id)?.data as TextPromptNodeData;
  assert.equal(data.text, 'Keep this instruction unchanged.');
});

function createPrompt(text: string) {
  return {
    id: 'prompt',
    type: 'textPrompt',
    position: { x: 400, y: 0 },
    size: { width: 300, height: 360 },
    status: 'idle',
    data: {
      title: 'Cover instruction',
      text,
      result: '',
      variables: [{ id: 'variable-0', alias: 'Variable 1' }],
    },
  } as ProductionNode;
}
