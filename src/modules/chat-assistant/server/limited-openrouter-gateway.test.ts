import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenRouterRequestError, type ToolCallingLanguageModelGateway } from '@prodactionpro/chat-connectors';
import { imageProductionTools } from '../contracts/image-production-tools.ts';
import { LimitedOpenRouterGateway } from './limited-openrouter-gateway.ts';

test('recovers transient provider connectivity without creating another user turn', async () => {
  let calls = 0;
  const client: ToolCallingLanguageModelGateway = {
    async completeWithTools(input) {
      calls += 1;
      if (calls === 1) throw new OpenRouterRequestError('offline', 'OPENROUTER_NETWORK_ERROR', true);
      return { content: 'Готово', model: input.model, provider: 'openrouter', toolCalls: [] };
    },
  };
  const gateway = createGateway(client);

  const result = await gateway.completeWithTools(createInput());

  assert.equal(result.content, 'Готово');
  assert.equal(calls, 2);
});

test('asks the model to repair invalid write-tool arguments before ChatModule sees them', async () => {
  const receivedMessageCounts: number[] = [];
  let calls = 0;
  const client: ToolCallingLanguageModelGateway = {
    async completeWithTools(input) {
      calls += 1;
      receivedMessageCounts.push(input.messages.length);
      if (calls === 1) {
        return {
          content: '',
          model: input.model,
          provider: 'openrouter',
          toolCalls: [{ id: 'bad-call', input: { nodes: 'wrong', summary: 'Update graph' }, name: 'pipeline_update' }],
          usage: { completionTokens: 10, costUsd: 0.001, promptTokens: 100, totalTokens: 110 },
        };
      }
      assert.equal(input.messages.at(-1)?.role, 'tool');
      return {
        content: '',
        model: input.model,
        provider: 'openrouter',
        toolCalls: [{
          id: 'fixed-call',
          input: {
            summary: 'Update graph',
            updates: [{ nodeId: 'node-1', settings: { title: 'Правила' } }],
          },
          name: 'pipeline_update',
        }],
        usage: { completionTokens: 20, costUsd: 0.002, promptTokens: 200, totalTokens: 220 },
      };
    },
  };

  const result = await createGateway(client).completeWithTools(createInput());

  assert.equal(calls, 2);
  assert.deepEqual(receivedMessageCounts, [2, 4]);
  assert.equal(result.toolCalls[0]?.id, 'fixed-call');
  assert.deepEqual(result.usage, {
    completionTokens: 30,
    costUsd: 0.003,
    promptTokens: 300,
    totalTokens: 330,
  });
});

function createGateway(client: ToolCallingLanguageModelGateway) {
  return new LimitedOpenRouterGateway({
    apiKey: 'test-key',
    appTitle: 'test',
    baseUrl: 'https://example.test',
    client,
    maxAttempts: 3,
    maxOutputTokens: 1_200,
    retryBaseDelayMs: 1,
    sleep: async () => undefined,
    timeoutMs: 120_000,
  });
}

function createInput() {
  return {
    messages: [
      { content: 'System', role: 'system' as const },
      { content: 'Сделай', role: 'user' as const },
    ],
    model: 'test-model',
    tools: imageProductionTools,
  };
}
