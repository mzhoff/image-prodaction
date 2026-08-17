import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallingLanguageModelResult } from '@prodactionpro/chat-connectors';
import { imageProductionTools } from '../contracts/image-production-tools.ts';
import { addTokenUsage, createToolInputCorrectionMessages } from './tool-input-recovery.ts';

test('turns invalid pipeline arguments into bounded model correction context', () => {
  const result = createToolInputCorrectionMessages({
    result: createResult('pipeline_build', { nodes: 'wrong', summary: 'Build graph' }),
    tools: imageProductionTools,
  });

  assert.equal(result?.[0]?.role, 'assistant');
  assert.equal(result?.[1]?.role, 'tool');
  assert.match(result?.[1]?.content ?? '', /pipeline_build/u);
  assert.match(result?.[1]?.content ?? '', /nodes/u);
  assert.match(result?.[1]?.content ?? '', /exactly one corrected tool call/u);
});

test('turns parallel read and write calls into one-call correction context', () => {
  const result = createToolInputCorrectionMessages({
    result: {
      content: '',
      model: 'test-model',
      provider: 'openrouter',
      toolCalls: [
        { id: 'read', input: { query: 'composition' }, name: 'node_catalog' },
        { id: 'write', input: {}, name: 'pipeline_build' },
      ],
    },
    tools: imageProductionTools,
  });

  assert.equal(result?.length, 3);
  assert.match(JSON.stringify(result?.[1]?.content ?? ''), /exactly one tool call per model step/u);
  assert.match(JSON.stringify(result?.[2]?.content ?? ''), /exactly one tool call per model step/u);
});

test('repairs multiple text sources aimed at one input before product preparation', () => {
  const result = createToolInputCorrectionMessages({
    result: createResult('pipeline_build', {
      documentName: 'Visual banner with QR',
      summary: 'Build a layered visual pipeline',
      nodes: [
        { key: 'copy', type: 'textPrompt' },
        { key: 'style', type: 'textPrompt' },
        { key: 'prompt', type: 'textGeneration' },
      ],
      edges: [
        { sourceNodeKey: 'copy', sourcePortId: 'text', targetNodeKey: 'prompt', targetPortId: 'text' },
        { sourceNodeKey: 'style', sourcePortId: 'text', targetNodeKey: 'prompt', targetPortId: 'text' },
      ],
    }),
    tools: imageProductionTools,
  });

  const correction = JSON.stringify(result?.[1]?.content ?? '');
  assert.match(correction, /at most one incoming connection/u);
  assert.match(correction, /textConcat/u);
  assert.match(correction, /without asking the user another question/u);
});

test('keeps the real usage of all correction calls', () => {
  assert.deepEqual(addTokenUsage(
    { completionTokens: 10, costUsd: 0.001, promptTokens: 100, totalTokens: 110 },
    { completionTokens: 20, costUsd: 0.002, promptTokens: 200, totalTokens: 220 },
  ), { completionTokens: 30, costUsd: 0.003, promptTokens: 300, totalTokens: 330 });
});

function createResult(name: string, input: Record<string, unknown>): ToolCallingLanguageModelResult {
  return {
    content: '',
    model: 'test-model',
    provider: 'openrouter',
    toolCalls: [{ id: 'call-1', input, name }],
  };
}
