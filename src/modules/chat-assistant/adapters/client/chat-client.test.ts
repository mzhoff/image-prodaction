import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageProductionChatClient } from './chat-client.ts';

test('chat client invokes browser fetch with the global receiver', async () => {
  const originalFetch = globalThis.fetch;
  let receiverWasGlobal = false;
  let observedWorkspace: string | null = null;

  globalThis.fetch = (function boundReceiverProbe(this: unknown, _input, init) {
    receiverWasGlobal = this === globalThis;
    observedWorkspace = new Headers(init?.headers).get('x-workspace-id');
    return Promise.resolve(new Response('[]', {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));
  }) as typeof fetch;

  try {
    const client = createImageProductionChatClient('workspace-1');
    await client.listConversations();

    assert.equal(receiverWasGlobal, true);
    assert.equal(observedWorkspace, 'workspace-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chat client uses the compatible JSON endpoint for runtime turns', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ conversationId: 'conversation-1' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const client = createImageProductionChatClient('workspace-1');
    await client.streamTurn({
      message: 'Проверка',
      mode: 'knowledge-base',
      model: 'openai/gpt-5.4-nano',
    });

    assert.equal(requestedUrl, '/api/chat/v1/turn');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
