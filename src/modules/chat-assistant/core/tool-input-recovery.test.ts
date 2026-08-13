import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallingLanguageModelResult } from '@prodactionpro/chat-connectors';
import { imageProductionTools } from '../contracts/image-production-tools.ts';
import { addTokenUsage, createToolInputCorrectionMessages } from './tool-input-recovery.ts';

test('turns invalid pipeline update arguments into bounded model correction context', () => {
  const result = createToolInputCorrectionMessages({
    result: createResult({ summary: 'Update graph', nodes: 'wrong' }),
    tools: imageProductionTools,
  });

  assert.equal(result?.[0]?.role, 'assistant');
  assert.equal(result?.[1]?.role, 'tool');
  assert.match(result?.[1]?.content ?? '', /pipeline_update/u);
  assert.match(result?.[1]?.content ?? '', /nodes/u);
  assert.match(result?.[1]?.content ?? '', /Do not ask the user/u);
});

test('accepts concise pipeline updates with omitted unchanged collections', () => {
  const result = createToolInputCorrectionMessages({
    result: createResult({
      summary: 'Rename existing node',
      updates: [{ nodeId: 'node-1', settings: { title: 'Новое имя' } }],
    }),
    tools: imageProductionTools,
  });
  assert.equal(result, undefined);
});

test('keeps the real usage of all correction calls', () => {
  assert.deepEqual(addTokenUsage(
    { completionTokens: 10, costUsd: 0.001, promptTokens: 100, totalTokens: 110 },
    { completionTokens: 20, costUsd: 0.002, promptTokens: 200, totalTokens: 220 },
  ), { completionTokens: 30, costUsd: 0.003, promptTokens: 300, totalTokens: 330 });
});

function createResult(input: Record<string, unknown>): ToolCallingLanguageModelResult {
  return {
    content: '',
    model: 'test-model',
    provider: 'openrouter',
    toolCalls: [{ id: 'call-1', input, name: 'pipeline_update' }],
  };
}
