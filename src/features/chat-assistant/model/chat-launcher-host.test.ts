import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ChatLauncherRuntime,
  ChatRuntimeState,
} from '@prodactionpro/chat-runtime-core';
import { createHostedChatLauncher } from './chat-launcher.ts';

test('hosted launcher drafts text without submitting', async () => {
  const harness = createRuntimeHarness();
  let surfaceOpenCount = 0;
  const launcher = createHostedChatLauncher({
    externalDraftConflict: false,
    openSurface: () => { surfaceOpenCount += 1; },
    runtime: harness.runtime,
  });

  const result = await launcher.open(createRequest());
  assert.deepEqual(result, { sourceId: 'node-help', status: 'drafted' });
  assert.equal(surfaceOpenCount, 1);
  assert.equal(harness.state.inputValue, 'Explain this node');
  assert.equal(harness.submitCount(), 0);
});

test('hosted launcher treats managed attachment queue as a draft conflict', async () => {
  const harness = createRuntimeHarness();
  let surfaceOpenCount = 0;
  const launcher = createHostedChatLauncher({
    externalDraftConflict: true,
    openSurface: () => { surfaceOpenCount += 1; },
    runtime: harness.runtime,
  });

  const result = await launcher.open(createRequest());
  assert.deepEqual(result, {
    reason: 'draft-conflict',
    sourceId: 'node-help',
    status: 'blocked',
  });
  assert.equal(surfaceOpenCount, 1);
  assert.equal(harness.state.inputValue, '');
  assert.equal(harness.submitCount(), 0);
});

test('hosted launcher preserves busy precedence over a managed attachment conflict', async () => {
  const harness = createRuntimeHarness();
  harness.state.phase = 'streaming';
  const launcher = createHostedChatLauncher({
    externalDraftConflict: true,
    openSurface: () => undefined,
    runtime: harness.runtime,
  });

  assert.deepEqual(await launcher.open(createRequest()), {
    reason: 'busy',
    sourceId: 'node-help',
    status: 'blocked',
  });
  assert.equal(harness.state.inputValue, '');
  assert.equal(harness.submitCount(), 0);
});

function createRequest() {
  return {
    message: { delivery: 'draft' as const, text: 'Explain this node' },
    sourceId: 'node-help',
  };
}

function createRuntimeHarness() {
  let submits = 0;
  const state = {
    attachments: [],
    inputValue: '',
    messages: [],
    pendingToolCalls: [],
    phase: 'idle',
    selectedImageFormat: '1:1',
    selectedMode: 'product-copilot',
    selectedModel: 'test-model',
  } as ChatRuntimeState;
  const runtime: ChatLauncherRuntime = {
    getSnapshot: () => state,
    setInputValue: (value) => { state.inputValue = value; },
    submit: async () => { submits += 1; },
  };
  return { runtime, state, submitCount: () => submits };
}
