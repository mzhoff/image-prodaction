import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_EVENT_TYPES, createChatEvent } from '@prodactionpro/chat-protocol';
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

test('chat client uses the ChatModule 0.7 SSE endpoint for runtime turns', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return new Response(createCompletedTurnEvent(), {
      headers: { 'Content-Type': 'text/event-stream' },
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

    assert.equal(requestedUrl, '/api/chat/v1/turn/stream');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createCompletedTurnEvent() {
  const response = {
    assistantMessage: {
      blocks: [{ content: 'Готово', type: 'text' as const }],
      conversationId: 'conversation-1',
      createdAt: '2026-08-12T00:00:01.000Z',
      id: 'message-assistant',
      role: 'assistant' as const,
    },
    conversationId: 'conversation-1',
    requestId: 'request-1',
    turnId: 'turn-1',
    userMessage: {
      blocks: [{ content: 'Проверка', type: 'text' as const }],
      conversationId: 'conversation-1',
      createdAt: '2026-08-12T00:00:00.000Z',
      id: 'message-user',
      role: 'user' as const,
    },
  };
  const envelope = createChatEvent({
    conversationId: 'conversation-1',
    data: response,
    emittedAt: '2026-08-12T00:00:02.000Z',
    eventId: 'event-done',
    requestId: 'request-1',
    sequence: 1,
    turnId: 'turn-1',
    type: CHAT_EVENT_TYPES.runCompleted,
  });
  return `event: done\ndata: ${JSON.stringify(envelope)}\n\n`;
}
