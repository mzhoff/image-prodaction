import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallingLanguageModelGateway } from '@prodactionpro/chat-connectors';
import { imageProductionTools } from '../contracts/image-production-tools.ts';
import { LimitedOpenRouterGateway } from './limited-openrouter-gateway.ts';

test('keeps product output and temperature limits while ChatModule owns provider retries', async () => {
  let receivedMaxTokens: number | undefined;
  let receivedTemperature: number | undefined;
  const client: ToolCallingLanguageModelGateway = {
    async completeWithTools(input) {
      receivedMaxTokens = input.maxTokens;
      receivedTemperature = input.temperature;
      return { content: 'Готово', model: input.model, provider: 'openrouter', toolCalls: [] };
    },
  };
  const gateway = new LimitedOpenRouterGateway({
    apiKey: 'test-key',
    appTitle: 'test',
    baseUrl: 'https://example.test',
    client,
    maxAttempts: 3,
    maxOutputTokens: 1_200,
    retryBaseDelayMs: 750,
    retryDeadlineMs: 70_000,
    timeoutMs: 60_000,
  });

  const result = await gateway.completeWithTools({
    maxTokens: 4_000,
    messages: [
      { content: 'System', role: 'system' },
      { content: 'Сделай', role: 'user' },
    ],
    model: 'test-model',
    tools: imageProductionTools,
  });

  assert.equal(result.content, 'Готово');
  assert.equal(receivedMaxTokens, 1_200);
  assert.equal(receivedTemperature, 0.2);
});

test('delegates invalid tool calls unchanged so ChatModule owns recovery', async () => {
  let calls = 0;
  const client: ToolCallingLanguageModelGateway = {
    async completeWithTools(input) {
      calls += 1;
      return {
        content: '',
        model: input.model,
        provider: 'openrouter',
        toolCalls: [{ id: 'bad', input: { nodes: 'wrong' }, name: 'pipeline_build' }],
      };
    },
  };
  const gateway = new LimitedOpenRouterGateway({
    apiKey: 'test-key', appTitle: 'test', baseUrl: 'https://example.test', client,
    maxAttempts: 3, maxOutputTokens: 1_200, retryBaseDelayMs: 750,
    retryDeadlineMs: 70_000, timeoutMs: 60_000,
  });

  const result = await gateway.completeWithTools({
    messages: [{ content: 'System', role: 'system' }, { content: 'Сделай', role: 'user' }],
    model: 'test-model',
    tools: imageProductionTools,
  });

  assert.equal(calls, 1);
  assert.equal(result.toolCalls[0]?.id, 'bad');
});
