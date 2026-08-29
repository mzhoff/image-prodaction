import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolCallRecord } from '@prodactionpro/chat-domain';
import { CHAT_EVENT_TYPES, createChatEvent } from '@prodactionpro/chat-protocol';
import type { ChatStreamEvent } from '@prodactionpro/chat-sdk';
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

test('chat client uses the ChatModule SSE endpoint for runtime turns', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (init?.method === 'POST') {
      requestedUrl = url;
      return new Response(createCompletedTurnEvent(), {
        headers: { 'Content-Type': 'text/event-stream' },
        status: 200,
      });
    }
    throw new Error('Unexpected conversation reconciliation request.');
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

test('chat client consumes a co-streamed tool call without a reconciliation request', async () => {
  const originalFetch = globalThis.fetch;
  const observedEvents: ChatStreamEvent[] = [];
  let conversationRequests = 0;
  const completedToolCall = createToolCall({
    id: 'tool-current',
    status: 'completed',
    turnId: 'turn-1',
  });

  globalThis.fetch = (async (_input, init) => {
    if (init?.method === 'POST') {
      return new Response(createCompletedToolTurnStream(completedToolCall), {
        headers: { 'Content-Type': 'text/event-stream' },
        status: 200,
      });
    }
    conversationRequests += 1;
    return Response.json({});
  }) as typeof fetch;

  try {
    const client = createImageProductionChatClient('workspace-1');
    await client.streamTurn({
      message: 'Покажи варианты',
      mode: 'product-copilot',
      model: 'openai/gpt-5.4-nano',
    }, {
      onEvent: (event) => observedEvents.push(event),
    });

    const delivered = observedEvents.filter((event) => (
      event.event === 'tool_call_completed' && event.data.id === 'tool-current'
    ));
    assert.equal(delivered.length, 1);
    assert.equal(conversationRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createCompletedToolTurnStream(toolCall: ToolCallRecord) {
  const envelope = createChatEvent({
    conversationId: 'conversation-1',
    data: toolCall,
    emittedAt: '2026-08-12T00:00:01.000Z',
    eventId: 'event-tool-completed',
    requestId: 'request-1',
    sequence: 1,
    turnId: 'turn-1',
    type: CHAT_EVENT_TYPES.toolCompleted,
  });
  return `event: tool_call_completed\ndata: ${JSON.stringify(envelope)}\n\n${createCompletedTurnEvent(2)}`;
}

function createCompletedTurnEvent(sequence = 1) {
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
    sequence,
    turnId: 'turn-1',
    type: CHAT_EVENT_TYPES.runCompleted,
  });
  return `event: done\ndata: ${JSON.stringify(envelope)}\n\n`;
}

function createToolCall(input: {
  id: string;
  status: ToolCallRecord['status'];
  turnId: string;
}): ToolCallRecord {
  return {
    completedAt: '2026-08-12T00:00:01.000Z',
    conversationId: 'conversation-1',
    createdAt: '2026-08-12T00:00:00.000Z',
    id: input.id,
    output: { action: 'select-design-elements' },
    riskLevel: 'read',
    status: input.status,
    toolName: 'design_element_selection',
    turnId: input.turnId,
    updatedAt: '2026-08-12T00:00:01.000Z',
  };
}
