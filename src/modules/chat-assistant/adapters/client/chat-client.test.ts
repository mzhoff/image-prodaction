import assert from 'node:assert/strict';
import test from 'node:test';
import type { Conversation, ToolCallRecord } from '@prodactionpro/chat-domain';
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
    return Response.json(createConversation());
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

test('chat client replays a completed tool call from the persisted turn snapshot', async () => {
  const originalFetch = globalThis.fetch;
  const observedEvents: ChatStreamEvent[] = [];
  const completedToolCall = createToolCall({
    id: 'tool-current',
    status: 'completed',
    turnId: 'turn-1',
  });
  const historicalToolCall = createToolCall({
    id: 'tool-historical',
    status: 'completed',
    turnId: 'turn-previous',
  });

  globalThis.fetch = (async (_input, init) => (
    init?.method === 'POST'
      ? new Response(createCompletedTurnEvent(), {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        })
      : Response.json(createConversation([completedToolCall, completedToolCall, historicalToolCall]))
  )) as typeof fetch;

  try {
    const client = createImageProductionChatClient('workspace-1');
    await client.streamTurn({
      message: 'Покажи варианты',
      mode: 'product-copilot',
      model: 'openai/gpt-5.4-nano',
    }, {
      onEvent: (event) => observedEvents.push(event),
    });

    const recovered = observedEvents.filter((event) => (
      event.event === 'tool_call_completed' && event.data.id === 'tool-current'
    ));
    assert.equal(recovered.length, 1);
    assert.equal(observedEvents.some((event) => (
      event.event === 'tool_call_completed' && event.data.id === 'tool-historical'
    )), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('tool snapshot reconciliation cannot fail an otherwise completed turn', async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let warning = '';

  console.warn = (message?: unknown) => { warning = String(message); };
  globalThis.fetch = (async (_input, init) => (
    init?.method === 'POST'
      ? new Response(createCompletedTurnEvent(), {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        })
      : new Response('unavailable', { status: 503 })
  )) as typeof fetch;

  try {
    const result = await createImageProductionChatClient('workspace-1').streamTurn({
      message: 'Проверка',
      mode: 'product-copilot',
      model: 'openai/gpt-5.4-nano',
    });

    assert.equal(result.turnId, 'turn-1');
    assert.equal(warning, '[chat-assistant-tool-reconciliation-skipped]');
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
  }
});

test('retry turn also restores the persisted interactive tool call', async () => {
  const originalFetch = globalThis.fetch;
  const observedEvents: ChatStreamEvent[] = [];
  const completedToolCall = createToolCall({
    id: 'tool-retry',
    status: 'completed',
    turnId: 'turn-1',
  });

  globalThis.fetch = (async (_input, init) => (
    init?.method === 'POST'
      ? new Response(createCompletedTurnEvent(), {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        })
      : Response.json(createConversation([completedToolCall]))
  )) as typeof fetch;

  try {
    const client = createImageProductionChatClient('workspace-1');
    await client.retryTurn({
      idempotencyKey: 'retry-key-1',
      originalTurnId: 'turn-original',
      retryOfTurnId: 'turn-failed',
    }, {
      onEvent: (event) => observedEvents.push(event),
    });

    assert.equal(observedEvents.some((event) => (
      event.event === 'tool_call_completed' && event.data.id === 'tool-retry'
    )), true);
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

function createConversation(toolCalls: ToolCallRecord[] = []): Conversation {
  return {
    agentTurns: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    id: 'conversation-1',
    messageCount: 2,
    messages: [],
    mode: 'product-copilot',
    status: 'active',
    toolCalls,
    totalCompletionTokens: 0,
    totalCostUsd: 0,
    totalPromptTokens: 0,
    totalTokens: 0,
    updatedAt: '2026-08-12T00:00:02.000Z',
  };
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
